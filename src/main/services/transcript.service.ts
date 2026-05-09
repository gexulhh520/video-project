import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { DoubaoAsrService } from "./doubao-asr.service";
import { FfmpegService } from "./ffmpeg.service";
import type { TaskProgress, TranscriptResult, TranscriptSegment } from "../types/app.types";

const MAX_DIRECT_ASR_BYTES = 20 * 1024 * 1024;
const CHUNK_SECONDS = 300;

export class TranscriptService {
  constructor(
    private readonly ffmpegService: FfmpegService,
    private readonly doubaoAsrService: DoubaoAsrService
  ) {}

  async transcribeAudio(
    audioPath: string,
    chunkOutputDir: string,
    onProgress?: (progress: TaskProgress) => void,
    taskId = "task"
  ): Promise<TranscriptResult> {
    const audioStat = await stat(audioPath);
    const allSegments: TranscriptSegment[] = [];

    if (audioStat.size <= MAX_DIRECT_ASR_BYTES) {
      onProgress?.({
        taskId,
        status: "transcribing",
        progress: 42,
        message: "正在识别音频内容"
      });

      const utterances = await this.doubaoAsrService.recognizeMp3ByDoubao(audioPath);
      allSegments.push(...this.mapUtterances(utterances, 0));
    } else {
      onProgress?.({
        taskId,
        status: "splitting_audio",
        progress: 28,
        message: "音频较大，正在切分 5 分钟片段"
      });

      const chunks = await this.ffmpegService.splitMp3(audioPath, chunkOutputDir, CHUNK_SECONDS);

      for (const [index, chunkPath] of chunks.entries()) {
        const chunkOffsetSeconds = index * CHUNK_SECONDS;
        const percent = 35 + Math.round(((index + 1) / chunks.length) * 25);

        onProgress?.({
          taskId,
          status: "transcribing",
          progress: percent,
          message: `正在识别分段音频 ${basename(chunkPath)}`
        });

        const utterances = await this.doubaoAsrService.recognizeMp3ByDoubao(chunkPath);
        allSegments.push(...this.mapUtterances(utterances, chunkOffsetSeconds, allSegments.length));
      }
    }

    const fullText = allSegments.map((segment) => segment.text).join("\n");
    return {
      provider: "doubao",
      fullText,
      segments: allSegments
    };
  }

  private mapUtterances(
    utterances: Array<{ start_time?: number; end_time?: number; text?: string; utterance?: string }>,
    chunkOffsetSeconds: number,
    startIndex = 0
  ): TranscriptSegment[] {
    return utterances
      .map((utterance, index) => {
        const text = utterance.text ?? utterance.utterance ?? "";
        if (!text.trim()) {
          return null;
        }

        const rawStart = utterance.start_time ?? 0;
        const rawEnd = utterance.end_time ?? rawStart;
        const segmentIndex = startIndex + index + 1;

        return {
          segmentId: `seg_${String(segmentIndex).padStart(5, "0")}`,
          start: chunkOffsetSeconds + rawStart / 1000,
          end: chunkOffsetSeconds + rawEnd / 1000,
          text: text.trim()
        } satisfies TranscriptSegment;
      })
      .filter((segment): segment is TranscriptSegment => Boolean(segment));
  }
}
