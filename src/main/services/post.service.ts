import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { FfmpegService } from "./ffmpeg.service";
import { TranscriptService } from "./transcript.service";
import { LlmService } from "./llm.service";
import type { ContentBlock, DraftSummary, PostDraft, TaskProgress } from "../types/app.types";

export class PostService {
  private readonly appDataRoot = resolve(process.cwd(), "app-data");
  private readonly draftsDir = join(this.appDataRoot, "drafts");

  constructor(
    private readonly ffmpegService: FfmpegService,
    private readonly transcriptService: TranscriptService,
    private readonly llmService: LlmService
  ) {}

  async generatePostFromVideo(
    sourceVideoPath: string,
    onProgress?: (progress: TaskProgress) => void
  ): Promise<PostDraft> {
    const draftId = uuidv4();
    const videoDir = join(this.appDataRoot, "videos", draftId);
    const audioDir = join(this.appDataRoot, "audios", draftId);
    const chunkDir = join(this.appDataRoot, "chunks", draftId);
    const frameDir = join(this.appDataRoot, "frames", draftId);
    const fileName = basename(sourceVideoPath);
    const copiedVideoPath = join(videoDir, fileName);
    const audioPath = join(audioDir, `${basename(fileName, extname(fileName))}.mp3`);

    await Promise.all([
      mkdir(videoDir, { recursive: true }),
      mkdir(audioDir, { recursive: true }),
      mkdir(chunkDir, { recursive: true }),
      mkdir(frameDir, { recursive: true }),
      mkdir(this.draftsDir, { recursive: true })
    ]);

    onProgress?.({
      taskId: draftId,
      status: "copying_video",
      progress: 8,
      message: "正在复制原始视频到工作目录"
    });
    await copyFile(sourceVideoPath, copiedVideoPath);

    onProgress?.({
      taskId: draftId,
      status: "extracting_audio",
      progress: 18,
      message: "正在抽取 MP3 音频"
    });
    await this.ffmpegService.extractMp3(copiedVideoPath, audioPath);

    const transcript = await this.transcriptService.transcribeAudio(audioPath, chunkDir, onProgress, draftId);

    onProgress?.({
      taskId: draftId,
      status: "generating_sections",
      progress: 68,
      message: "正在生成图文段落与标题"
    });
    const llmResult = await this.llmService.generateSectionsByLlm(transcript.segments);

    onProgress?.({
      taskId: draftId,
      status: "extracting_frames",
      progress: 78,
      message: "正在抽取段落配图"
    });

    const contentBlocks: ContentBlock[] = [];
    for (const section of llmResult.sections) {
      contentBlocks.push({
        type: "paragraph",
        blockId: `${section.sectionId}_p`,
        sectionId: section.sectionId,
        text: section.paragraph
      });

      const firstRange = section.sourceTimeRanges[0] ?? { start: 0, end: 0, reason: "自动兜底图片" };
      const midpoint = (firstRange.start + firstRange.end) / 2;
      const safeMidpoint = Number.isFinite(midpoint) ? Math.max(midpoint, 0) : 0;
      const imagePath = join(frameDir, `${section.sectionId}_${safeMidpoint.toFixed(1)}.jpg`);

      await this.ffmpegService.extractFrameAt(copiedVideoPath, safeMidpoint, imagePath);
      contentBlocks.push({
        type: "image",
        blockId: `${section.sectionId}_i`,
        sectionId: section.sectionId,
        imagePath,
        time: safeMidpoint,
        caption: firstRange.reason
      });
    }

    onProgress?.({
      taskId: draftId,
      status: "building_post",
      progress: 92,
      message: "正在组装图文草稿"
    });

    const postDraft: PostDraft = {
      draftId,
      title: llmResult.title,
      fullText: llmResult.sections.map((section) => section.paragraph).join("\n\n"),
      sections: llmResult.sections,
      contentBlocks,
      createdAt: new Date().toISOString()
    };

    await writeFile(join(this.draftsDir, `${draftId}.json`), JSON.stringify(postDraft, null, 2), "utf8");

    onProgress?.({
      taskId: draftId,
      status: "completed",
      progress: 100,
      message: "图文稿生成完成"
    });

    return postDraft;
  }

  async listDrafts(): Promise<DraftSummary[]> {
    await mkdir(this.draftsDir, { recursive: true });
    const files = await readdir(this.draftsDir);
    const drafts = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const content = await readFile(join(this.draftsDir, file), "utf8");
          const draft = JSON.parse(content) as PostDraft;
          const coverImagePath = draft.contentBlocks.find((block) => block.type === "image")?.imagePath;

          return {
            draftId: draft.draftId,
            title: draft.title,
            createdAt: draft.createdAt,
            sectionCount: draft.sections.length,
            coverImagePath
          } satisfies DraftSummary;
        })
    );

    return drafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getDraftById(draftId: string): Promise<PostDraft> {
    await mkdir(this.draftsDir, { recursive: true });
    const draftPath = join(this.draftsDir, `${draftId}.json`);
    const content = await readFile(draftPath, "utf8");
    return JSON.parse(content) as PostDraft;
  }
}
