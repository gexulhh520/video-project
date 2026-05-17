import { contextBridge, ipcRenderer } from "electron";
import type {
  ArticleRewriteConfigStatus,
  ArticleRewriteSettings,
  AppSettings,
  ContentStudioConfigStatus,
  ContentStudioSettings,
  ContentStudioTask,
  ContentStudioTaskSummary,
  ContentStudioTopicProgress,
  ConfirmWebRecordBodyOptions,
  DeleteWebRecordOptions,
  DeleteWebRewriteHistoryOptions,
  DesktopApi,
  DraftSummary,
  FramePreviewResult,
  GeneratePostOptions,
  OpenCliRuntimeHealthStatus,
  PostDraft,
  ReplaceFrameAssetOptions,
  RewriteDraftOptions,
  RewriteDraftIterativeOptions,
  RewriteWebTaskOptions,
  IterativeRewriteWebTaskOptions,
  RewriteParagraphOptions,
  SaveEditedFrameOptions,
  SaveWebRewriteResultOptions,
  TestContentStudioModelOptions,
  ContentStudioParagraphImagePlanUpdate,
  ContentStudioGenerateImageOptions,
  TaskProgress,
  TopicCreateInput,
  LicenseStatus,
  VideoToPostConfigStatus,
  VideoToPostSettings,
  WebCrawlStartOptions,
  WebCrawlTask,
  WebTaskProgress,
  WebTaskSummary,
  WebToPostConfigStatus,
  WebToPostSettings
} from "../main/types/app.types";
import { TASK_PROGRESS_CHANNEL, WEB_TASK_PROGRESS_CHANNEL } from "../main/ipc";
import { CONTENT_STUDIO_TOPIC_PROGRESS_CHANNEL } from "../main/ipc";

const desktopApi: DesktopApi = {
  selectVideo: async () => ipcRenderer.invoke("video:select"),
  selectWord: async () => ipcRenderer.invoke("word:select"),
  selectImage: async () => ipcRenderer.invoke("image:select"),
  selectDirectory: async () => ipcRenderer.invoke("directory:select"),
  generatePost: async (videoPath: string, options: GeneratePostOptions): Promise<PostDraft> =>
    ipcRenderer.invoke("post:generate", videoPath, options),
  importArticleRewriteWordDraft: async (wordPath: string): Promise<PostDraft> =>
    ipcRenderer.invoke("article-draft:import-word", wordPath),
  listArticleRewriteDrafts: async (): Promise<DraftSummary[]> => ipcRenderer.invoke("article-draft:list"),
  getArticleRewriteDraftById: async (draftId: string): Promise<PostDraft> =>
    ipcRenderer.invoke("article-draft:get", draftId),
  saveArticleRewriteDraft: async (draft: PostDraft): Promise<PostDraft> =>
    ipcRenderer.invoke("article-draft:save", draft),
  exportArticleRewriteDraftToWord: async (draft: PostDraft): Promise<string | null> =>
    ipcRenderer.invoke("article-draft:export-word", draft),
  exportArticleRewriteDraftImagesArchive: async (draft: PostDraft): Promise<string | null> =>
    ipcRenderer.invoke("article-draft:export-images-archive", draft),
  replaceArticleRewriteDraftImage: async (draftId: string, blockId: string, sourceImagePath: string): Promise<PostDraft> =>
    ipcRenderer.invoke("article-draft:replace-image", draftId, blockId, sourceImagePath),
  rewriteArticleRewriteParagraph: async (options: RewriteParagraphOptions): Promise<string> =>
    ipcRenderer.invoke("article-draft:rewrite-paragraph", options),
  rewriteArticleRewriteDraft: async (options: RewriteDraftOptions): Promise<PostDraft> =>
    ipcRenderer.invoke("article-draft:rewrite", options),
  rewriteArticleRewriteDraftIterative: async (options: RewriteDraftIterativeOptions): Promise<PostDraft> =>
    ipcRenderer.invoke("article-draft:rewrite-iterative", options),
  listDrafts: async (): Promise<DraftSummary[]> => ipcRenderer.invoke("draft:list"),
  getDraftById: async (draftId: string): Promise<PostDraft> => ipcRenderer.invoke("draft:get", draftId),
  saveDraft: async (draft: PostDraft): Promise<PostDraft> => ipcRenderer.invoke("draft:save", draft),
  exportDraftToWord: async (draft: PostDraft): Promise<string | null> => ipcRenderer.invoke("draft:export-word", draft),
  exportDraftImagesArchive: async (draft: PostDraft): Promise<string | null> =>
    ipcRenderer.invoke("draft:export-images-archive", draft),
  getAppSettings: async (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  saveAppSettings: async (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke("settings:save", settings),
  getVideoToPostSettings: async (): Promise<VideoToPostSettings> => ipcRenderer.invoke("video-to-post-settings:get"),
  saveVideoToPostSettings: async (settings: VideoToPostSettings): Promise<VideoToPostSettings> =>
    ipcRenderer.invoke("video-to-post-settings:save", settings),
  getVideoToPostConfigStatus: async (): Promise<VideoToPostConfigStatus> =>
    ipcRenderer.invoke("video-to-post-settings:status"),
  getArticleRewriteSettings: async (): Promise<ArticleRewriteSettings> =>
    ipcRenderer.invoke("article-rewrite-settings:get"),
  saveArticleRewriteSettings: async (settings: ArticleRewriteSettings): Promise<ArticleRewriteSettings> =>
    ipcRenderer.invoke("article-rewrite-settings:save", settings),
  getArticleRewriteConfigStatus: async (): Promise<ArticleRewriteConfigStatus> =>
    ipcRenderer.invoke("article-rewrite-settings:status"),
  getContentStudioSettings: async (): Promise<ContentStudioSettings> =>
    ipcRenderer.invoke("content-studio-settings:get"),
  saveContentStudioSettings: async (settings: ContentStudioSettings): Promise<ContentStudioSettings> =>
    ipcRenderer.invoke("content-studio-settings:save", settings),
  getContentStudioConfigStatus: async (): Promise<ContentStudioConfigStatus> =>
    ipcRenderer.invoke("content-studio-settings:status"),
  checkContentStudioOpenCliHealth: async (command?: string): Promise<OpenCliRuntimeHealthStatus> =>
    ipcRenderer.invoke("content-studio-settings:opencli-health-check", command),
  repairContentStudioOpenCliRuntime: async (command?: string): Promise<OpenCliRuntimeHealthStatus> =>
    ipcRenderer.invoke("content-studio-settings:opencli-health-repair", command),
  testContentStudioModel: async (options: TestContentStudioModelOptions) =>
    ipcRenderer.invoke("content-studio-settings:test-model", options),
  listContentStudioTasks: async (): Promise<ContentStudioTaskSummary[]> => ipcRenderer.invoke("content-studio-task:list"),
  getContentStudioTaskById: async (taskId: string): Promise<ContentStudioTask> =>
    ipcRenderer.invoke("content-studio-task:get", taskId),
  deleteContentStudioTask: async (taskId: string): Promise<void> => ipcRenderer.invoke("content-studio-task:delete", taskId),
  runContentStudioTopic: async (options: TopicCreateInput): Promise<ContentStudioTask> =>
    ipcRenderer.invoke("content-studio-topic:run", options),
  saveContentStudioImagePlan: async (
    taskId: string,
    updates: ContentStudioParagraphImagePlanUpdate[]
  ): Promise<ContentStudioTask> =>
    ipcRenderer.invoke("content-studio-layout:save-image-plan", taskId, updates),
  addContentStudioLocalImage: async (taskId: string, sourceImagePath: string): Promise<ContentStudioTask> =>
    ipcRenderer.invoke("content-studio-layout:add-local-image", taskId, sourceImagePath),
  bindContentStudioImage: async (taskId: string, paragraphId: string, assetId: string): Promise<ContentStudioTask> =>
    ipcRenderer.invoke("content-studio-layout:bind-image", taskId, paragraphId, assetId),
  unbindContentStudioImage: async (taskId: string, paragraphId: string): Promise<ContentStudioTask> =>
    ipcRenderer.invoke("content-studio-layout:unbind-image", taskId, paragraphId),
  deleteContentStudioImage: async (taskId: string, assetId: string): Promise<ContentStudioTask> =>
    ipcRenderer.invoke("content-studio-layout:delete-image", taskId, assetId),
  buildContentStudioPublishDraft: async (taskId: string): Promise<string> =>
    ipcRenderer.invoke("content-studio-layout:build-publish-draft", taskId),
  generateContentStudioAiImage: async (
    taskId: string,
    options: ContentStudioGenerateImageOptions
  ): Promise<ContentStudioTask> =>
    ipcRenderer.invoke("content-studio-layout:generate-ai-image", taskId, options),
  exportContentStudioWord: async (taskId: string): Promise<string | null> =>
    ipcRenderer.invoke("content-studio-layout:export-word", taskId),
  exportContentStudioImages: async (taskId: string): Promise<string | null> =>
    ipcRenderer.invoke("content-studio-layout:export-images", taskId),
  getWebToPostSettings: async (): Promise<WebToPostSettings> => ipcRenderer.invoke("web-to-post-settings:get"),
  saveWebToPostSettings: async (settings: WebToPostSettings): Promise<WebToPostSettings> =>
    ipcRenderer.invoke("web-to-post-settings:save", settings),
  getWebToPostConfigStatus: async (): Promise<WebToPostConfigStatus> => ipcRenderer.invoke("web-to-post-settings:status"),
  checkOpenCliHealth: async () => ipcRenderer.invoke("opencli:health:check"),
  repairOpenCliRuntime: async () => ipcRenderer.invoke("opencli:health:repair"),
  openOpenCliProviderLoginPage: async (provider, profile) =>
    ipcRenderer.invoke("opencli:provider:open-login", provider, profile),
  testOpenCliProvider: async (provider, profile) =>
    ipcRenderer.invoke("opencli:provider:test", provider, profile),
  replaceDraftImage: async (draftId: string, blockId: string, sourceImagePath: string): Promise<PostDraft> =>
    ipcRenderer.invoke("draft:replace-image", draftId, blockId, sourceImagePath),
  previewDraftFrame: async (draftId: string, options: ReplaceFrameAssetOptions): Promise<FramePreviewResult> =>
    ipcRenderer.invoke("draft:preview-frame", draftId, options),
  replaceDraftImageFromFrame: async (
    draftId: string,
    blockId: string,
    options: ReplaceFrameAssetOptions
  ): Promise<PostDraft> => ipcRenderer.invoke("draft:replace-image-from-frame", draftId, blockId, options),
  saveEditedFrame: async (options: SaveEditedFrameOptions) => ipcRenderer.invoke("image:save-edited-frame", options),
  rewriteParagraph: async (options: RewriteParagraphOptions): Promise<string> => ipcRenderer.invoke("paragraph:rewrite", options),
  rewriteDraft: async (options: RewriteDraftOptions): Promise<PostDraft> => ipcRenderer.invoke("draft:rewrite", options),
  rewriteDraftIterative: async (options: RewriteDraftIterativeOptions): Promise<PostDraft> =>
    ipcRenderer.invoke("draft:rewrite-iterative", options),
  listWebTasks: async (): Promise<WebTaskSummary[]> => ipcRenderer.invoke("web-task:list"),
  getWebTaskById: async (taskId: string): Promise<WebCrawlTask> => ipcRenderer.invoke("web-task:get", taskId),
  createWebTask: async (title?: string): Promise<WebCrawlTask> => ipcRenderer.invoke("web-task:create", title),
  startWebCrawl: async (taskId: string, options: WebCrawlStartOptions): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:start-crawl", taskId, options),
  saveWebRecordBody: async (taskId: string, options: ConfirmWebRecordBodyOptions): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:save-record-body", taskId, options),
  retryWebRecordExtract: async (taskId: string, options: { recordId: string; prompt: string }): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:retry-record-extract", taskId, options),
  collectWebRecordImages: async (taskId: string, recordId: string): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:collect-images", taskId, recordId),
  rewriteWebTask: async (taskId: string, options: RewriteWebTaskOptions): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:rewrite", taskId, options),
  rewriteWebTaskIterative: async (taskId: string, options: IterativeRewriteWebTaskOptions): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:rewrite-iterative", taskId, options),
  saveWebRewriteResult: async (taskId: string, options: SaveWebRewriteResultOptions): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:save-rewrite-result", taskId, options),
  deleteWebRewriteHistory: async (taskId: string, options: DeleteWebRewriteHistoryOptions): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:delete-rewrite-history", taskId, options),
  toggleWebImageSelection: async (taskId: string, assetId: string, selected: boolean): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:toggle-image", taskId, assetId, selected),
  deleteWebRecord: async (taskId: string, options: DeleteWebRecordOptions): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:delete-record", taskId, options),
  deleteWebTask: async (taskId: string): Promise<void> => ipcRenderer.invoke("web-task:delete-task", taskId),
  renameWebTask: async (taskId: string, title: string): Promise<WebCrawlTask> =>
    ipcRenderer.invoke("web-task:rename-task", taskId, title),
  exportWebTaskToWord: async (taskId: string): Promise<string | null> => ipcRenderer.invoke("web-task:export-word", taskId),
  autoExportWebTaskBundle: async (taskId: string) => ipcRenderer.invoke("web-task:auto-export-bundle", taskId),
  getMachineId: async (): Promise<string> => ipcRenderer.invoke("license:get-machine-id"),
  checkLicense: async (): Promise<LicenseStatus> => ipcRenderer.invoke("license:check"),
  activateLicense: async (licenseKey: string): Promise<LicenseStatus> => ipcRenderer.invoke("license:activate", licenseKey),
  readImageAsDataUrl: async (imagePath: string): Promise<string> => ipcRenderer.invoke("image:read-data-url", imagePath),
  onTaskProgress: (callback: (progress: TaskProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: TaskProgress): void => {
      callback(progress);
    };

    ipcRenderer.on(TASK_PROGRESS_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(TASK_PROGRESS_CHANNEL, listener);
    };
  },
  onWebTaskProgress: (callback: (progress: WebTaskProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: WebTaskProgress): void => {
      callback(progress);
    };

    ipcRenderer.on(WEB_TASK_PROGRESS_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(WEB_TASK_PROGRESS_CHANNEL, listener);
    };
  },
  onContentStudioTopicProgress: (callback: (progress: ContentStudioTopicProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ContentStudioTopicProgress): void => {
      callback(progress);
    };

    ipcRenderer.on(CONTENT_STUDIO_TOPIC_PROGRESS_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(CONTENT_STUDIO_TOPIC_PROGRESS_CHANNEL, listener);
    };
  }
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
