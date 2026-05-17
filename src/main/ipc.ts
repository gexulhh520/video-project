import { BrowserWindow, dialog, ipcMain } from "electron";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type {
  OpenCliProvider,
  OpenCliProviderStatus,
  OpenCliRuntimeHealthStatus,
  ArticleRewriteConfigStatus,
  ArticleRewriteSettings,
  AppSettings,
  ContentStudioConfigStatus,
  ContentStudioSettings,
  ContentStudioTask,
  ContentStudioTaskSummary,
  TestContentStudioModelOptions,
  TopicCreateInput,
  ConfirmWebRecordBodyOptions,
  DeleteWebRewriteHistoryOptions,
  DeleteWebRecordOptions,
  GeneratePostOptions,
  IterativeRewriteWebTaskOptions,
  PostDraft,
  ReplaceFrameAssetOptions,
  RewriteDraftIterativeOptions,
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
import { OpenCliWebTaskService } from "./services/opencli/opencli-web-task.service";
import { OpenCliRuntimeService } from "./services/opencli/opencli-runtime.service";
import { OpenCliWebLlmService } from "./services/opencli/opencli-web-llm.service";
import { ImageEditService } from "./services/image-edit.service";
import { LicenseService } from "./services/license.service";
import { ArticleRewriteService } from "./services/article-rewrite.service";
import { ContentStudioSettingsService } from "./services/content-studio/content-studio-settings.service";
import { ContentStudioService } from "./services/content-studio/content-studio.service";

export const TASK_PROGRESS_CHANNEL = "task:progress";
export const WEB_TASK_PROGRESS_CHANNEL = "web-task:progress";

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  postService: PostService,
  settingsService: SettingsService,
  webTaskService: WebTaskService,
  openCliWebTaskService: OpenCliWebTaskService,
  openCliRuntimeService: OpenCliRuntimeService,
  openCliWebLlmService: OpenCliWebLlmService,
  imageEditService: ImageEditService,
  articleRewriteService: ArticleRewriteService,
  contentStudioSettingsService: ContentStudioSettingsService,
  contentStudioService: ContentStudioService
): void {
  const licenseService = new LicenseService();
  const getActiveWebTaskService = async (): Promise<WebTaskService | OpenCliWebTaskService> => {
    const settings = await settingsService.getWebToPostSettings();
    return settings.runtime === "bb-browser" ? webTaskService : openCliWebTaskService;
  };

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
  ipcMain.handle("word:select", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择 Word 文档",
      properties: ["openFile"],
      filters: [{ name: "Word", extensions: ["docx"] }]
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
  ipcMain.handle("article-rewrite-settings:get", async (): Promise<ArticleRewriteSettings> =>
    settingsService.getArticleRewriteSettings()
  );
  ipcMain.handle(
    "article-rewrite-settings:save",
    async (_event, settings: ArticleRewriteSettings): Promise<ArticleRewriteSettings> =>
      settingsService.saveArticleRewriteSettings(settings)
  );
  ipcMain.handle("article-rewrite-settings:status", async (): Promise<ArticleRewriteConfigStatus> =>
    settingsService.getArticleRewriteConfigStatus()
  );
  ipcMain.handle("content-studio-settings:get", async (): Promise<ContentStudioSettings> =>
    contentStudioSettingsService.getSettings()
  );
  ipcMain.handle(
    "content-studio-settings:save",
    async (_event, settings: ContentStudioSettings): Promise<ContentStudioSettings> =>
      contentStudioSettingsService.saveSettings(settings)
  );
  ipcMain.handle("content-studio-settings:status", async (): Promise<ContentStudioConfigStatus> =>
    contentStudioSettingsService.getConfigStatus()
  );
  ipcMain.handle(
    "content-studio-settings:opencli-health-check",
    async (_event, command?: string): Promise<OpenCliRuntimeHealthStatus> =>
      contentStudioSettingsService.checkOpenCliHealth(command)
  );
  ipcMain.handle(
    "content-studio-settings:opencli-health-repair",
    async (_event, command?: string): Promise<OpenCliRuntimeHealthStatus> =>
      contentStudioSettingsService.repairOpenCliRuntime(command)
  );
  ipcMain.handle(
    "content-studio-settings:test-model",
    async (_event, options: TestContentStudioModelOptions): Promise<OpenCliProviderStatus> =>
      contentStudioSettingsService.testModel(options)
  );
  ipcMain.handle("content-studio-task:list", async (): Promise<ContentStudioTaskSummary[]> =>
    contentStudioService.listTasks()
  );
  ipcMain.handle("content-studio-task:get", async (_event, taskId: string): Promise<ContentStudioTask> =>
    contentStudioService.getTaskById(taskId)
  );
  ipcMain.handle("content-studio-task:delete", async (_event, taskId: string): Promise<void> =>
    contentStudioService.deleteTask(taskId)
  );
  ipcMain.handle("content-studio-topic:run", async (_event, options: TopicCreateInput): Promise<ContentStudioTask> =>
    contentStudioService.runTopicCreate(options)
  );
  ipcMain.handle("web-to-post-settings:get", async (): Promise<WebToPostSettings> => settingsService.getWebToPostSettings());
  ipcMain.handle("web-to-post-settings:save", async (_event, settings: WebToPostSettings): Promise<WebToPostSettings> =>
    settingsService.saveWebToPostSettings(settings)
  );
  ipcMain.handle("web-to-post-settings:status", async (): Promise<WebToPostConfigStatus> =>
    settingsService.getWebToPostConfigStatus()
  );
  ipcMain.handle("opencli:health:check", async (): Promise<OpenCliRuntimeHealthStatus> =>
    openCliRuntimeService.checkHealth()
  );
  ipcMain.handle("opencli:health:repair", async (): Promise<OpenCliRuntimeHealthStatus> =>
    openCliRuntimeService.repair()
  );
  ipcMain.handle("opencli:provider:open-login", async (_event, provider: OpenCliProvider, profile?: string): Promise<void> => {
    const selectedProfile = await openCliRuntimeService.resolveActiveProfile(profile);
    await openCliWebLlmService.openProviderLoginPage(provider, selectedProfile);
  });
  ipcMain.handle(
    "opencli:provider:test",
    async (_event, provider: OpenCliProvider, profile?: string): Promise<OpenCliProviderStatus> => {
      const selectedProfile = await openCliRuntimeService.resolveActiveProfile(profile);
      return openCliWebLlmService.testProvider(provider, selectedProfile);
    }
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
  ipcMain.handle("draft:rewrite-iterative", async (_event, options: RewriteDraftIterativeOptions) =>
    postService.rewriteDraftIterative(options)
  );
  ipcMain.handle("article-draft:import-word", async (_event, wordPath: string): Promise<PostDraft> =>
    articleRewriteService.importWordDraft(wordPath)
  );
  ipcMain.handle("article-draft:list", async () => articleRewriteService.listDrafts());
  ipcMain.handle("article-draft:get", async (_event, draftId: string) => articleRewriteService.getDraftById(draftId));
  ipcMain.handle("article-draft:save", async (_event, draft: PostDraft) => articleRewriteService.saveDraft(draft));
  ipcMain.handle("article-draft:export-word", async (_event, draft: PostDraft) => {
    const defaultFileName = `${sanitizeFileName(draft.title || "图文改写草稿")}.docx`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出 Word 文档",
      defaultPath: defaultFileName,
      filters: [{ name: "Word Document", extensions: ["docx"] }]
    });
    if (result.canceled || !result.filePath) return null;
    return articleRewriteService.exportDraftToWord(draft, result.filePath);
  });
  ipcMain.handle("article-draft:export-images-archive", async (_event, draft: PostDraft) => {
    const defaultFileName = `${sanitizeFileName(draft.title || "图文改写草稿")}_配图.zip`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出文章配图压缩包",
      defaultPath: defaultFileName,
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }]
    });
    if (result.canceled || !result.filePath) return null;
    return articleRewriteService.exportDraftImagesArchive(draft, result.filePath);
  });
  ipcMain.handle(
    "article-draft:replace-image",
    async (_event, draftId: string, blockId: string, sourceImagePath: string) =>
      articleRewriteService.replaceDraftImage(draftId, blockId, sourceImagePath)
  );
  ipcMain.handle("article-draft:rewrite-paragraph", async (_event, options: RewriteParagraphOptions) =>
    articleRewriteService.rewriteParagraph(options.paragraph)
  );
  ipcMain.handle("article-draft:rewrite", async (_event, options: RewriteDraftOptions) =>
    articleRewriteService.rewriteDraft(options)
  );
  ipcMain.handle("article-draft:rewrite-iterative", async (_event, options: RewriteDraftIterativeOptions) =>
    articleRewriteService.rewriteDraftIterative(options)
  );
  ipcMain.handle("web-task:list", async (): Promise<WebTaskSummary[]> => {
    const activeService = await getActiveWebTaskService();
    return activeService.listTasks();
  });
  ipcMain.handle("web-task:get", async (_event, taskId: string): Promise<WebCrawlTask> => {
    const activeService = await getActiveWebTaskService();
    return activeService.getTaskById(taskId);
  });
  ipcMain.handle("web-task:create", async (_event, title?: string): Promise<WebCrawlTask> => {
    const activeService = await getActiveWebTaskService();
    return activeService.createTask(title);
  });
  ipcMain.handle("web-task:start-crawl", async (_event, taskId: string, options: WebCrawlStartOptions): Promise<WebCrawlTask> => {
    const sendProgress = (progress: WebTaskProgress): void => {
      mainWindow.webContents.send(WEB_TASK_PROGRESS_CHANNEL, progress);
    };

    const activeService = await getActiveWebTaskService();
    return activeService.startCrawl(taskId, options, sendProgress);
  });
  ipcMain.handle(
    "web-task:save-record-body",
    async (_event, taskId: string, options: ConfirmWebRecordBodyOptions): Promise<WebCrawlTask> => {
      const activeService = await getActiveWebTaskService();
      return activeService.saveRecordBody(taskId, options);
    }
  );
  ipcMain.handle(
    "web-task:retry-record-extract",
    async (_event, taskId: string, options: { recordId: string; prompt: string }): Promise<WebCrawlTask> => {
      const activeService = await getActiveWebTaskService();
      return activeService.retryRecordExtract(taskId, options);
    }
  );
  ipcMain.handle("web-task:collect-images", async (_event, taskId: string, recordId: string): Promise<WebCrawlTask> => {
    const sendProgress = (progress: WebTaskProgress): void => {
      mainWindow.webContents.send(WEB_TASK_PROGRESS_CHANNEL, progress);
    };

    const activeService = await getActiveWebTaskService();
    return activeService.collectRecordImages(taskId, recordId, sendProgress);
  });
  ipcMain.handle("web-task:rewrite", async (_event, taskId: string, options: RewriteWebTaskOptions): Promise<WebCrawlTask> => {
    const sendProgress = (progress: WebTaskProgress): void => {
      mainWindow.webContents.send(WEB_TASK_PROGRESS_CHANNEL, progress);
    };

    const activeService = await getActiveWebTaskService();
    return activeService.rewriteTask(taskId, options, sendProgress);
  });
  ipcMain.handle(
    "web-task:rewrite-iterative",
    async (_event, taskId: string, options: IterativeRewriteWebTaskOptions): Promise<WebCrawlTask> => {
      const sendProgress = (progress: WebTaskProgress): void => {
        mainWindow.webContents.send(WEB_TASK_PROGRESS_CHANNEL, progress);
      };

      const activeService = await getActiveWebTaskService();
      return activeService.rewriteTaskIterative(taskId, options, sendProgress);
    }
  );
  ipcMain.handle(
    "web-task:save-rewrite-result",
    async (_event, taskId: string, options: SaveWebRewriteResultOptions): Promise<WebCrawlTask> => {
      const activeService = await getActiveWebTaskService();
      return activeService.saveRewriteResult(taskId, options);
    }
  );
  ipcMain.handle(
    "web-task:delete-rewrite-history",
    async (_event, taskId: string, options: DeleteWebRewriteHistoryOptions): Promise<WebCrawlTask> => {
      const activeService = await getActiveWebTaskService();
      return activeService.deleteRewriteHistory(taskId, options.rewriteId);
    }
  );
  ipcMain.handle("web-task:toggle-image", async (_event, taskId: string, assetId: string, selected: boolean): Promise<WebCrawlTask> => {
    const activeService = await getActiveWebTaskService();
    return activeService.toggleImageSelection(taskId, assetId, selected);
  });
  ipcMain.handle("web-task:delete-record", async (_event, taskId: string, options: DeleteWebRecordOptions): Promise<WebCrawlTask> => {
    const activeService = await getActiveWebTaskService();
    return activeService.deleteRecord(taskId, options.recordId);
  });
  ipcMain.handle("web-task:delete-task", async (_event, taskId: string): Promise<void> => {
    const activeService = await getActiveWebTaskService();
    await activeService.deleteTask(taskId);
  });
  ipcMain.handle("web-task:rename-task", async (_event, taskId: string, title: string): Promise<WebCrawlTask> => {
    const activeService = await getActiveWebTaskService();
    return activeService.renameTask(taskId, title);
  });
  ipcMain.handle("web-task:export-word", async (_event, taskId: string) => {
    const activeService = await getActiveWebTaskService();
    const task = await activeService.getTaskById(taskId);
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

    return activeService.exportTaskToWord(taskId, result.filePath);
  });
  ipcMain.handle("web-task:auto-export-bundle", async (_event, taskId: string) => {
    const activeService = await getActiveWebTaskService();
    return activeService.autoExportTaskBundle(taskId);
  });
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
