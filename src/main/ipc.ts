import { BrowserWindow, dialog, ipcMain } from "electron";
import type { PostDraft, TaskProgress } from "./types/app.types";
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

  ipcMain.handle("post:generate", async (_event, videoPath: string): Promise<PostDraft> => {
    const sendProgress = (progress: TaskProgress): void => {
      mainWindow.webContents.send(TASK_PROGRESS_CHANNEL, progress);
    };

    try {
      return await postService.generatePostFromVideo(videoPath, sendProgress);
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
}
