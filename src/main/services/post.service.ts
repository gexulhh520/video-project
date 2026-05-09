import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type {
  ContentBlock,
  DraftSummary,
  FramePreviewResult,
  GeneratePostOptions,
  PostDraft,
  TaskProgress
} from "../types/app.types";
import { FfmpegService } from "./ffmpeg.service";
import { LlmService } from "./llm.service";
import { SettingsService } from "./settings.service";
import { TranscriptService } from "./transcript.service";

const DEFAULT_FRAME_OFFSET_SECONDS = 2;

export class PostService {
  constructor(
    private readonly ffmpegService: FfmpegService,
    private readonly transcriptService: TranscriptService,
    private readonly llmService: LlmService,
    private readonly settingsService: SettingsService
  ) {}

  async generatePostFromVideo(
    sourceVideoPath: string,
    options?: GeneratePostOptions,
    onProgress?: (progress: TaskProgress) => void
  ): Promise<PostDraft> {
    const draftId = uuidv4();
    const workspaceDir = await this.getWorkspaceDir();
    const draftsDir = join(workspaceDir, "drafts");
    const videoDir = join(workspaceDir, "videos", draftId);
    const audioDir = join(workspaceDir, "audios", draftId);
    const chunkDir = join(workspaceDir, "chunks", draftId);
    const frameDir = join(workspaceDir, "frames", draftId);
    const fileName = basename(sourceVideoPath);
    const copiedVideoPath = join(videoDir, fileName);
    const audioPath = join(audioDir, `${basename(fileName, extname(fileName))}.mp3`);

    await Promise.all([
      mkdir(videoDir, { recursive: true }),
      mkdir(audioDir, { recursive: true }),
      mkdir(chunkDir, { recursive: true }),
      mkdir(frameDir, { recursive: true }),
      mkdir(draftsDir, { recursive: true })
    ]);

    onProgress?.({
      taskId: draftId,
      status: "copying_video",
      progress: 8,
      message: "正在复制原视频到空间目录"
    });
    await copyFile(sourceVideoPath, copiedVideoPath);

    onProgress?.({
      taskId: draftId,
      status: "extracting_audio",
      progress: 18,
      message: "正在提取 MP3 音频"
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

      const firstRange = section.sourceTimeRanges[0] ?? { start: 0, end: 0, reason: "自动兜底配图" };
      const requestedOffsetSeconds = Number.isFinite(options?.frameOffsetSeconds)
        ? Math.max(options?.frameOffsetSeconds ?? DEFAULT_FRAME_OFFSET_SECONDS, 0)
        : DEFAULT_FRAME_OFFSET_SECONDS;
      const candidateFrameTime = firstRange.start + requestedOffsetSeconds;
      const maxFrameTime = Number.isFinite(firstRange.end) ? Math.max(firstRange.end, firstRange.start) : firstRange.start;
      const safeFrameTime = Math.max(firstRange.start, Math.min(candidateFrameTime, maxFrameTime));
      const imagePath = join(frameDir, `${section.sectionId}_${safeFrameTime.toFixed(1)}.jpg`);

      await this.ffmpegService.extractFrameAt(copiedVideoPath, safeFrameTime, imagePath);
      contentBlocks.push({
        type: "image",
        blockId: `${section.sectionId}_i`,
        sectionId: section.sectionId,
        imagePath,
        time: safeFrameTime,
        caption: firstRange.reason,
        sourceType: "auto",
        sourceTimeRange: firstRange
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceVideoPath: copiedVideoPath
    };

    await this.saveDraft(postDraft);

    onProgress?.({
      taskId: draftId,
      status: "completed",
      progress: 100,
      message: "图文稿生成完成"
    });

    return postDraft;
  }

  async listDrafts(): Promise<DraftSummary[]> {
    const draftsDir = await this.getDraftsDir();
    await mkdir(draftsDir, { recursive: true });
    const files = await readdir(draftsDir);

    const drafts = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const content = await readFile(join(draftsDir, file), "utf8");
          const draft = await this.normalizeDraft(JSON.parse(content) as PostDraft);
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
    const draftsDir = await this.getDraftsDir();
    await mkdir(draftsDir, { recursive: true });
    const draftPath = join(draftsDir, `${draftId}.json`);
    const content = await readFile(draftPath, "utf8");
    return this.normalizeDraft(JSON.parse(content) as PostDraft);
  }

  async saveDraft(draft: PostDraft): Promise<PostDraft> {
    const draftsDir = await this.getDraftsDir();
    await mkdir(draftsDir, { recursive: true });
    const normalizedDraft = await this.normalizeDraft(draft, true);
    await writeFile(join(draftsDir, `${normalizedDraft.draftId}.json`), JSON.stringify(normalizedDraft, null, 2), "utf8");
    return normalizedDraft;
  }

  async exportDraftToWord(draft: PostDraft, outputPath: string): Promise<string> {
    const normalizedDraft = await this.normalizeDraft(draft, true);
    const workspaceDir = await this.getWorkspaceDir();
    const exportTempDir = join(workspaceDir, "exports", "tmp", normalizedDraft.draftId);
    const tempDraftJsonPath = join(exportTempDir, `draft-${Date.now()}.json`);

    await mkdir(exportTempDir, { recursive: true });
    await writeFile(tempDraftJsonPath, JSON.stringify(normalizedDraft, null, 2), "utf8");

    try {
      await this.runWordExportScript(tempDraftJsonPath, outputPath);
      return outputPath;
    } finally {
      await rm(exportTempDir, { recursive: true, force: true });
    }
  }

  async replaceDraftImage(draftId: string, blockId: string, sourceImagePath: string): Promise<PostDraft> {
    const draft = await this.getDraftById(draftId);
    const targetBlock = draft.contentBlocks.find(
      (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image" && block.blockId === blockId
    );

    if (!targetBlock) {
      throw new Error("未找到要替换的图片块。");
    }

    const workspaceDir = await this.getWorkspaceDir();
    const frameDir = join(workspaceDir, "frames", draftId);
    await mkdir(frameDir, { recursive: true });

    const extension = extname(sourceImagePath) || ".jpg";
    const copiedImagePath = join(frameDir, `${blockId}_manual_${Date.now()}${extension}`);
    await copyFile(sourceImagePath, copiedImagePath);

    targetBlock.imagePath = copiedImagePath;
    targetBlock.sourceType = "upload";
    targetBlock.caption = "用户手动替换图片";

    return this.saveDraft(draft);
  }

  async previewDraftFrame(draftId: string, timeSeconds: number): Promise<FramePreviewResult> {
    const draft = await this.getDraftById(draftId);
    if (!draft.sourceVideoPath) {
      throw new Error("当前草稿缺少原视频路径，无法从视频重新选帧。");
    }

    const workspaceDir = await this.getWorkspaceDir();
    const frameDir = join(workspaceDir, "frames", draftId);
    await mkdir(frameDir, { recursive: true });
    const previewPath = join(frameDir, `__preview_${Math.round(timeSeconds * 1000)}.jpg`);
    await this.ffmpegService.extractFrameAt(draft.sourceVideoPath, timeSeconds, previewPath);
    const imageBuffer = await readFile(previewPath);

    return {
      imageDataUrl: `data:image/jpeg;base64,${imageBuffer.toString("base64")}`,
      timeSeconds
    };
  }

  async replaceDraftImageFromFrame(draftId: string, blockId: string, timeSeconds: number): Promise<PostDraft> {
    const draft = await this.getDraftById(draftId);
    if (!draft.sourceVideoPath) {
      throw new Error("当前草稿缺少原视频路径，无法从视频重新选帧。");
    }

    const targetBlock = draft.contentBlocks.find(
      (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image" && block.blockId === blockId
    );

    if (!targetBlock) {
      throw new Error("未找到要替换的图片块。");
    }

    const workspaceDir = await this.getWorkspaceDir();
    const frameDir = join(workspaceDir, "frames", draftId);
    await mkdir(frameDir, { recursive: true });
    const outputPath = join(frameDir, `${blockId}_frame_${timeSeconds.toFixed(3).replace(".", "_")}.jpg`);
    await this.ffmpegService.extractFrameAt(draft.sourceVideoPath, timeSeconds, outputPath);

    targetBlock.imagePath = outputPath;
    targetBlock.time = timeSeconds;
    targetBlock.sourceType = "video-frame";
    targetBlock.caption = `用户从视频 ${timeSeconds.toFixed(1)}s 重新选帧`;

    return this.saveDraft(draft);
  }

  private async getWorkspaceDir(): Promise<string> {
    return (await this.settingsService.getSettings()).workspaceDir;
  }

  private async getDraftsDir(): Promise<string> {
    return join(await this.getWorkspaceDir(), "drafts");
  }

  private async getVideosDir(): Promise<string> {
    return join(await this.getWorkspaceDir(), "videos");
  }

  private async runWordExportScript(draftJsonPath: string, outputPath: string): Promise<void> {
    const pythonPath = await this.resolvePythonExecutablePath();
    const scriptPath = resolve(process.cwd(), "scripts", "export_draft_docx.py");
    await mkdir(dirname(outputPath), { recursive: true });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(pythonPath, [scriptPath, draftJsonPath, outputPath], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        rejectPromise(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }

        rejectPromise(new Error(`Word export failed with code ${code}: ${stderr}`));
      });
    });
  }

  private async resolvePythonExecutablePath(): Promise<string> {
    const bundledPythonPath = join(
      homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "python.exe"
    );

    try {
      await access(bundledPythonPath, constants.X_OK);
      return bundledPythonPath;
    } catch {
      return "python";
    }
  }

  private async normalizeDraft(draft: PostDraft, touchUpdatedAt = false): Promise<PostDraft> {
    const sections = draft.sections.map((section) => ({
      ...section,
      paragraph: section.paragraph ?? "",
      sourceSegmentIds: section.sourceSegmentIds ?? [],
      sourceTimeRanges: section.sourceTimeRanges ?? []
    }));

    const contentBlocks = draft.contentBlocks.map((block) => {
      if (block.type === "paragraph") {
        const sourceSection = sections.find((section) => section.sectionId === block.sectionId);
        return {
          ...block,
          text: sourceSection?.paragraph ?? block.text ?? ""
        } satisfies ContentBlock;
      }

      return {
        ...block,
        sourceType: block.sourceType ?? "auto"
      } satisfies ContentBlock;
    });

    const nowIso = new Date().toISOString();
    const fallbackVideoPath = draft.sourceVideoPath ?? (await this.resolveStoredVideoPath(draft.draftId));

    return {
      ...draft,
      sections,
      contentBlocks,
      fullText: sections.map((section) => section.paragraph).join("\n\n"),
      updatedAt: touchUpdatedAt ? nowIso : draft.updatedAt ?? draft.createdAt,
      sourceVideoPath: fallbackVideoPath
    };
  }

  private async resolveStoredVideoPath(draftId: string): Promise<string | undefined> {
    const draftVideoDir = join(await this.getVideosDir(), draftId);

    try {
      const entries = await readdir(draftVideoDir, { withFileTypes: true });
      const fileEntry = entries.find((entry) => entry.isFile());
      return fileEntry ? join(draftVideoDir, fileEntry.name) : undefined;
    } catch {
      return undefined;
    }
  }
}
