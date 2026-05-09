import { BrowserWindow, dialog, ipcMain } from "electron";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { GeneratePostOptions, PostDraft, TaskProgress } from "./types/app.types";
import { PostService } from "./services/post.service";

export const TASK_PROGRESS_CHANNEL = "task:progress";

export function registerIpcHandlers(mainWindow: BrowserWindow, postService: PostService): void {
  ipcMain.handle("video:select", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择视频文件",
      properties: ["openFile"],
      filters: [
        {
          name: "Video",
          extensions: ["mp4", "mov", "mkv", "avi"]
        }
      ]
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("image:select", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择替换图片",
      properties: ["openFile"],
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpg", "jpeg", "webp"]
        }
      ]
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("post:generate", async (_event, videoPath: string, options: GeneratePostOptions): Promise<PostDraft> => {
    const sendProgress = (progress: TaskProgress): void => {
      mainWindow.webContents.send(TASK_PROGRESS_CHANNEL, progress);
    };

    try {
      return await postService.generatePostFromVideo(videoPath, options, sendProgress);
    } catch (error) {
      sendProgress({
        taskId: "unknown",
        status: "failed",
        progress: 100,
        message: error instanceof Error ? error.message : "生成失败"
      });
      throw error;
    }
  });

  ipcMain.handle("draft:list", async () => postService.listDrafts());
  ipcMain.handle("draft:get", async (_event, draftId: string) => postService.getDraftById(draftId));
  ipcMain.handle("draft:save", async (_event, draft: PostDraft) => postService.saveDraft(draft));
  ipcMain.handle("draft:export-word", async (_event, draft: PostDraft) => {
    const defaultFileName = `${sanitizeFileName(draft.title || "图文草稿")}.docx`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出 Word 文档",
      defaultPath: defaultFileName,
      filters: [
        {
          name: "Word Document",
          extensions: ["docx"]
        }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return postService.exportDraftToWord(draft, result.filePath);
  });
  ipcMain.handle("draft:replace-image", async (_event, draftId: string, blockId: string, sourceImagePath: string) =>
    postService.replaceDraftImage(draftId, blockId, sourceImagePath)
  );
  ipcMain.handle("draft:preview-frame", async (_event, draftId: string, timeSeconds: number) =>
    postService.previewDraftFrame(draftId, timeSeconds)
  );
  ipcMain.handle("draft:replace-image-from-frame", async (_event, draftId: string, blockId: string, timeSeconds: number) =>
    postService.replaceDraftImageFromFrame(draftId, blockId, timeSeconds)
  );
  ipcMain.handle("image:read-data-url", async (_event, imagePath: string) => {
    const buffer = await readFile(imagePath);
    const extension = extname(imagePath).toLowerCase();
    const mimeType =
      extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";

    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  });
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "图文草稿";
}
