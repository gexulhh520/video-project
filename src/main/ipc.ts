import { BrowserWindow, dialog, ipcMain } from "electron";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type {
  AppSettings,
  ConfirmWebRecordBodyOptions,
  DeleteWebRecordOptions,
  GeneratePostOptions,
  PostDraft,
  ReplaceFrameAssetOptions,
  RewriteDraftOptions,
  RewriteWebTaskOptions,
  RewriteParagraphOptions,
  SaveEditedFrameOptions,
  SaveWebRewriteResultOptions,
  TaskProgress,
  WebCrawlStartOptions,
  WebCrawlTask,
  WebTaskProgress,
  VideoToPostConfigStatus,
  VideoToPostSettings,
  WebTaskSummary,
  WebToPostConfigStatus,
  WebToPostSettings
} from "./types/app.types";
import { PostService } from "./services/post.service";
import { SettingsService } from "./services/settings.service";
import { WebTaskService } from "./services/web-task.service";
import { ImageEditService } from "./services/image-edit.service";
import { LicenseService } from "./services/license.service";

export const TASK_PROGRESS_CHANNEL = "task:progress";
export const WEB_TASK_PROGRESS_CHANNEL = "web-task:progress";

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  postService: PostService,
  settingsService: SettingsService,
  webTaskService: WebTaskService,
  imageEditService: ImageEditService
): void {
  const licenseService = new LicenseService();

  ipcMain.handle("license:get-machine-id", async () => licenseService.getMachineId());
  ipcMain.handle("license:check", async () => licenseService.checkLocalLicense());
  ipcMain.handle("license:activate", async (_event, licenseKey: string) => licenseService.activate(licenseKey));

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

  ipcMain.handle("directory:select", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择工作空间目录",
      properties: ["openDirectory", "createDirectory"]
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("settings:get", async (): Promise<AppSettings> => settingsService.getSettings());
  ipcMain.handle("settings:save", async (_event, settings: AppSettings): Promise<AppSettings> =>
    settingsService.saveSettings(settings)
  );
  ipcMain.handle("video-to-post-settings:get", async (): Promise<VideoToPostSettings> => settingsService.getVideoToPostSettings());
  ipcMain.handle("video-to-post-settings:save", async (_event, settings: VideoToPostSettings): Promise<VideoToPostSettings> =>
    settingsService.saveVideoToPostSettings(settings)
  );
  ipcMain.handle("video-to-post-settings:status", async (): Promise<VideoToPostConfigStatus> =>
    settingsService.getVideoToPostConfigStatus()
  );
  ipcMain.handle("web-to-post-settings:get", async (): Promise<WebToPostSettings> => settingsService.getWebToPostSettings());
  ipcMain.handle("web-to-post-settings:save", async (_event, settings: WebToPostSettings): Promise<WebToPostSettings> =>
    settingsService.saveWebToPostSettings(settings)
  );
  ipcMain.handle("web-to-post-settings:status", async (): Promise<WebToPostConfigStatus> =>
    settingsService.getWebToPostConfigStatus()
  );

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
  ipcMain.handle("draft:export-images-archive", async (_event, draft: PostDraft) => {
    const defaultFileName = `${sanitizeFileName(draft.title || "鍥炬枃鑽夌")}_配图.zip`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出文章配图压缩包",
      defaultPath: defaultFileName,
      filters: [
        {
          name: "ZIP Archive",
          extensions: ["zip"]
        }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return postService.exportDraftImagesArchive(draft, result.filePath);
  });
  ipcMain.handle("draft:replace-image", async (_event, draftId: string, blockId: string, sourceImagePath: string) =>
    postService.replaceDraftImage(draftId, blockId, sourceImagePath)
  );
  ipcMain.handle("paragraph:rewrite", async (_event, options: RewriteParagraphOptions) => postService.rewriteParagraph(options.paragraph));
  ipcMain.handle("draft:rewrite", async (_event, options: RewriteDraftOptions) => postService.rewriteDraft(options));
  ipcMain.handle("web-task:list", async (): Promise<WebTaskSummary[]> => webTaskService.listTasks());
  ipcMain.handle("web-task:get", async (_event, taskId: string): Promise<WebCrawlTask> => webTaskService.getTaskById(taskId));
  ipcMain.handle("web-task:create", async (_event, title?: string): Promise<WebCrawlTask> => webTaskService.createTask(title));
  ipcMain.handle("web-task:start-crawl", async (_event, taskId: string, options: WebCrawlStartOptions): Promise<WebCrawlTask> => {
    const sendProgress = (progress: WebTaskProgress): void => {
      mainWindow.webContents.send(WEB_TASK_PROGRESS_CHANNEL, progress);
    };

    return webTaskService.startCrawl(taskId, options, sendProgress);
  });
  ipcMain.handle("web-task:save-record-body", async (_event, taskId: string, options: ConfirmWebRecordBodyOptions): Promise<WebCrawlTask> =>
    webTaskService.saveRecordBody(taskId, options)
  );
  ipcMain.handle("web-task:retry-record-extract", async (_event, taskId: string, options: { recordId: string; prompt: string }): Promise<WebCrawlTask> =>
    webTaskService.retryRecordExtract(taskId, options)
  );
  ipcMain.handle("web-task:collect-images", async (_event, taskId: string, recordId: string): Promise<WebCrawlTask> => {
    const sendProgress = (progress: WebTaskProgress): void => {
      mainWindow.webContents.send(WEB_TASK_PROGRESS_CHANNEL, progress);
    };

    return webTaskService.collectRecordImages(taskId, recordId, sendProgress);
  });
  ipcMain.handle("web-task:rewrite", async (_event, taskId: string, options: RewriteWebTaskOptions): Promise<WebCrawlTask> => {
    const sendProgress = (progress: WebTaskProgress): void => {
      mainWindow.webContents.send(WEB_TASK_PROGRESS_CHANNEL, progress);
    };

    return webTaskService.rewriteTask(taskId, options, sendProgress);
  });
  ipcMain.handle("web-task:save-rewrite-result", async (_event, taskId: string, options: SaveWebRewriteResultOptions): Promise<WebCrawlTask> =>
    webTaskService.saveRewriteResult(taskId, options)
  );
  ipcMain.handle("web-task:toggle-image", async (_event, taskId: string, assetId: string, selected: boolean): Promise<WebCrawlTask> =>
    webTaskService.toggleImageSelection(taskId, assetId, selected)
  );
  ipcMain.handle("web-task:delete-record", async (_event, taskId: string, options: DeleteWebRecordOptions): Promise<WebCrawlTask> =>
    webTaskService.deleteRecord(taskId, options.recordId)
  );
  ipcMain.handle("web-task:delete-task", async (_event, taskId: string): Promise<void> => webTaskService.deleteTask(taskId));
  ipcMain.handle("web-task:rename-task", async (_event, taskId: string, title: string): Promise<WebCrawlTask> =>
    webTaskService.renameTask(taskId, title)
  );
  ipcMain.handle("web-task:export-word", async (_event, taskId: string) => {
    const task = await webTaskService.getTaskById(taskId);
    const defaultFileName = `${sanitizeFileName(task.rewriteResult?.title || task.title || "网页原创草稿")}.docx`;
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

    return webTaskService.exportTaskToWord(taskId, result.filePath);
  });
  ipcMain.handle("web-task:auto-export-bundle", async (_event, taskId: string) =>
    webTaskService.autoExportTaskBundle(taskId)
  );
  ipcMain.handle("draft:preview-frame", async (_event, draftId: string, options: ReplaceFrameAssetOptions) =>
    postService.previewDraftFrame(draftId, options)
  );
  ipcMain.handle(
    "draft:replace-image-from-frame",
    async (_event, draftId: string, blockId: string, options: ReplaceFrameAssetOptions) =>
      postService.replaceDraftImageFromFrame(draftId, blockId, options)
  );
  ipcMain.handle("image:save-edited-frame", async (_event, options: SaveEditedFrameOptions) =>
    imageEditService.saveEditedFrame(options)
  );
  ipcMain.handle("image:read-data-url", async (_event, imagePath: string) => {
    const buffer = await readFile(imagePath);
    const extension = extname(imagePath).toLowerCase();
    const mimeType =
      extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : extension === ".gif"
            ? "image/gif"
            : "image/jpeg";

    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  });
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "图文草稿";
}
