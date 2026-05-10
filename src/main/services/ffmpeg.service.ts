import { constants } from "node:fs";
import { access, mkdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

export class FfmpegService {
  private readonly gifWidth = 640;
  private readonly gifMaxBytes = 5 * 1024 * 1024;

  async extractMp3(videoPath: string, outputMp3Path: string): Promise<void> {
    await this.ensureParentDirectory(outputMp3Path);
    await this.run([
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      outputMp3Path
    ]);
  }

  async splitMp3(audioPath: string, outputDir: string, segmentSeconds = 300): Promise<string[]> {
    await mkdir(outputDir, { recursive: true });
    const outputPattern = join(outputDir, "chunk_%03d.mp3");
    await this.run([
      "-y",
      "-i",
      audioPath,
      "-f",
      "segment",
      "-segment_time",
      String(segmentSeconds),
      "-reset_timestamps",
      "1",
      outputPattern
    ]);

    const glob = await import("node:fs/promises");
    const files = await glob.readdir(outputDir);
    return files
      .filter((file) => file.endsWith(".mp3"))
      .sort()
      .map((file) => join(outputDir, file));
  }

  async extractFrameAt(videoPath: string, timeSeconds: number, outputImagePath: string): Promise<void> {
    await this.ensureParentDirectory(outputImagePath);
    await this.run([
      "-y",
      "-ss",
      timeSeconds.toFixed(3),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputImagePath
    ]);
  }

  async createGifFromVideoSegment(
    videoPath: string,
    startSeconds: number,
    durationSeconds: number,
    outputGifPath: string
  ): Promise<{ sizeBytes: number; width: number }> {
    await this.ensureParentDirectory(outputGifPath);

    const attempts = [
      { fps: 12, colors: 96 },
      { fps: 10, colors: 80 },
      { fps: 8, colors: 64 },
      { fps: 6, colors: 48 },
      { fps: 5, colors: 40 }
    ];

    let lastSizeBytes = 0;

    for (const attempt of attempts) {
      const palettePath = `${outputGifPath}.palette.png`;

      try {
        const filterBase = `fps=${attempt.fps},scale=${this.gifWidth}:-1:flags=lanczos`;
        await this.run([
          "-y",
          "-ss",
          startSeconds.toFixed(3),
          "-t",
          durationSeconds.toFixed(3),
          "-i",
          videoPath,
          "-vf",
          `${filterBase},palettegen=max_colors=${attempt.colors}:stats_mode=diff`,
          palettePath
        ]);

        await this.run([
          "-y",
          "-ss",
          startSeconds.toFixed(3),
          "-t",
          durationSeconds.toFixed(3),
          "-i",
          videoPath,
          "-i",
          palettePath,
          "-lavfi",
          `${filterBase}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
          outputGifPath
        ]);

        const outputStats = await stat(outputGifPath);
        lastSizeBytes = outputStats.size;
        if (outputStats.size <= this.gifMaxBytes) {
          return {
            sizeBytes: outputStats.size,
            width: this.gifWidth
          };
        }
      } finally {
        await rm(palettePath, { force: true }).catch(() => undefined);
      }
    }

    return {
      sizeBytes: lastSizeBytes,
      width: this.gifWidth
    };
  }

  async getExecutablePath(): Promise<string> {
    const candidatePaths = [
      resolve(process.cwd(), "resources", "ffmpeg", "win", "ffmpeg.exe"),
      resolve(process.resourcesPath, "ffmpeg", "win", "ffmpeg.exe"),
      resolve(process.resourcesPath, "resources", "ffmpeg", "win", "ffmpeg.exe")
    ];

    for (const candidatePath of candidatePaths) {
      try {
        await access(candidatePath, constants.X_OK);
        return candidatePath;
      } catch {
        continue;
      }
    }

    return "ffmpeg";
  }

  private async run(args: string[]): Promise<void> {
    const ffmpegPath = await this.getExecutablePath();

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(ffmpegPath, args, {
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

        rejectPromise(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
      });
    });
  }

  private async ensureParentDirectory(filePath: string): Promise<void> {
    const { dirname } = await import("node:path");
    await mkdir(dirname(filePath), { recursive: true });
  }
}
