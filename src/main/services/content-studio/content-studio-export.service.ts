import { spawn } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { ContentBlock, PostDraft } from "../../types/app.types";
import type { ContentStudioTask } from "../../types/content-studio.types";
import { runPythonTool } from "../python-tool-runner";
import { ContentStudioTaskStore } from "./content-studio-task-store";

export class ContentStudioExportService {
  constructor(private readonly taskStore: ContentStudioTaskStore) {}

  async exportWord(taskId: string, outputPath: string): Promise<string> {
    const task = await this.taskStore.getTaskById(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    if (!task.result) {
      throw new Error("当前任务没有文章内容");
    }

    const workspaceDir = dirname(await this.taskStore.getTaskDirPath(taskId));
    const tempDir = join(workspaceDir, "exports", "tmp", `${taskId}-layout-word`);
    const tempJsonPath = join(tempDir, `layout-draft-${Date.now()}.json`);
    await mkdir(tempDir, { recursive: true });

    const postDraft = this.toPostDraft(taskId, task);
    await writeFile(tempJsonPath, JSON.stringify(postDraft, null, 2), "utf8");

    try {
      await mkdir(dirname(outputPath), { recursive: true });
      await runPythonTool("export_draft_docx", "export_draft_docx.py", [tempJsonPath, outputPath], {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      });
      return outputPath;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async exportImages(taskId: string, outputPath: string): Promise<string> {
    const task = await this.taskStore.getTaskById(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    if (!task.imageAssets.length) {
      throw new Error("当前任务没有可导出的图片");
    }

    const workspaceDir = dirname(await this.taskStore.getTaskDirPath(taskId));
    const tempDir = join(workspaceDir, "exports", "tmp", `${taskId}-layout-images`);
    const stagingDir = join(tempDir, "images");
    await mkdir(stagingDir, { recursive: true });

    try {
      for (const [index, asset] of task.imageAssets.entries()) {
        const extension = extname(asset.fileName || asset.localPath) || ".jpg";
        const exportName = `${String(index + 1).padStart(2, "0")}_${this.sanitizeFileName(asset.fileName)}${extension}`;
        await copyFile(asset.localPath, join(stagingDir, exportName));
      }

      await this.runZipArchiveScript(stagingDir, outputPath);
      return outputPath;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private toPostDraft(taskId: string, task: ContentStudioTask): PostDraft {
    const paragraphs = task.result?.paragraphs ?? [];
    const bindings = new Map((task.imageBindings ?? []).map((binding) => [binding.paragraphId, binding.assetId]));
    const assets = new Map(task.imageAssets.map((asset) => [asset.assetId, asset]));

    const contentBlocks: ContentBlock[] = [];
    paragraphs.forEach((paragraph, index) => {
      const sectionId = paragraph.paragraphId || `p${index + 1}`;
      contentBlocks.push({
        type: "paragraph",
        blockId: `${sectionId}_p`,
        sectionId,
        text: paragraph.text
      });

      const bindAssetId = bindings.get(paragraph.paragraphId);
      const bindAsset = bindAssetId ? assets.get(bindAssetId) : undefined;
      if (bindAsset) {
        contentBlocks.push({
          type: "image",
          blockId: `${sectionId}_i`,
          sectionId,
          imagePath: bindAsset.localPath,
          time: index + 1,
          caption: bindAsset.caption || paragraph.imagePlan?.caption,
          sourceType: "upload"
        });
      }
    });

    return {
      draftId: `content-studio-${taskId}`,
      title: task.result?.title || task.title,
      fullText: paragraphs.map((paragraph) => paragraph.text).join("\n\n"),
      sections: paragraphs.map((paragraph, index) => ({
        sectionId: paragraph.paragraphId || `p${index + 1}`,
        paragraph: paragraph.text,
        sourceSegmentIds: [],
        sourceTimeRanges: [{ start: 0, end: 0, reason: "content-studio layout export" }]
      })),
      contentBlocks,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
  }

  private async runZipArchiveScript(sourceDir: string, outputPath: string): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "& { param([string]$SourceDir,[string]$OutputPath) if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force } Compress-Archive -Path (Join-Path $SourceDir '*') -DestinationPath $OutputPath -Force }",
          sourceDir,
          outputPath
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => rejectPromise(error));
      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        rejectPromise(new Error(`Images archive export failed with code ${code}: ${stderr}`));
      });
    });
  }

  private sanitizeFileName(value: string): string {
    return value.replace(/[<>:\"/\\|?*\u0000-\u001F]/g, "_").trim() || "image";
  }
}
