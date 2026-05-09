import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

export class FfmpegService {
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

  async getExecutablePath(): Promise<string> {
    const localPath = resolve(process.cwd(), "resources", "ffmpeg", "win", "ffmpeg.exe");

    try {
      await access(localPath, constants.X_OK);
      return localPath;
    } catch {
      return "ffmpeg";
    }
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
