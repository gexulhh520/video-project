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
  ContentStudioMaterialPack,
  ContentStudioMaterialProgress,
  ContentStudioTopicProgress,
  ConfirmWebRecordBodyOptions,
  DeleteWebRecordOptions,
  DeleteWebRewriteHistoryOptions,
  DraftSummary,
  FramePreviewResult,
  GeneratePostOptions,
  LicenseStatus,
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
  MaterialRewriteInput,
  TopicCreateInput,
  VideoToPostConfigStatus,
  VideoToPostSettings,
  WebCrawlStartOptions,
  WebCrawlTask,
  WebTaskAutoExportResult,
  WebTaskProgress,
  WebTaskSummary,
  WebToPostConfigStatus,
  WebToPostSettings
} from "../../../main/types/app.types";

function toPlainObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const desktopApi = {
  selectVideo: (): Promise<string | null> => window.desktopApi.selectVideo(),
  selectWord: (): Promise<string | null> => window.desktopApi.selectWord(),
  selectImage: (): Promise<string | null> => window.desktopApi.selectImage(),
  selectDirectory: (): Promise<string | null> => window.desktopApi.selectDirectory(),
  generatePost: (videoPath: string, options: GeneratePostOptions): Promise<PostDraft> =>
    window.desktopApi.generatePost(videoPath, options),
  importArticleRewriteWordDraft: (wordPath: string): Promise<PostDraft> => window.desktopApi.importArticleRewriteWordDraft(wordPath),
  listArticleRewriteDrafts: (): Promise<DraftSummary[]> => window.desktopApi.listArticleRewriteDrafts(),
  getArticleRewriteDraftById: (draftId: string): Promise<PostDraft> => window.desktopApi.getArticleRewriteDraftById(draftId),
  saveArticleRewriteDraft: (draft: PostDraft): Promise<PostDraft> => window.desktopApi.saveArticleRewriteDraft(toPlainObject(draft)),
  exportArticleRewriteDraftToWord: (draft: PostDraft): Promise<string | null> =>
    window.desktopApi.exportArticleRewriteDraftToWord(toPlainObject(draft)),
  exportArticleRewriteDraftImagesArchive: (draft: PostDraft): Promise<string | null> =>
    window.desktopApi.exportArticleRewriteDraftImagesArchive(toPlainObject(draft)),
  replaceArticleRewriteDraftImage: (draftId: string, blockId: string, sourceImagePath: string): Promise<PostDraft> =>
    window.desktopApi.replaceArticleRewriteDraftImage(draftId, blockId, sourceImagePath),
  rewriteArticleRewriteParagraph: (options: RewriteParagraphOptions): Promise<string> =>
    window.desktopApi.rewriteArticleRewriteParagraph(toPlainObject(options)),
  rewriteArticleRewriteDraft: (options: RewriteDraftOptions): Promise<PostDraft> =>
    window.desktopApi.rewriteArticleRewriteDraft(toPlainObject(options)),
  rewriteArticleRewriteDraftIterative: (options: RewriteDraftIterativeOptions): Promise<PostDraft> =>
    window.desktopApi.rewriteArticleRewriteDraftIterative(toPlainObject(options)),
  listDrafts: (): Promise<DraftSummary[]> => window.desktopApi.listDrafts(),
  getDraftById: (draftId: string): Promise<PostDraft> => window.desktopApi.getDraftById(draftId),
  saveDraft: (draft: PostDraft): Promise<PostDraft> => window.desktopApi.saveDraft(toPlainObject(draft)),
  exportDraftToWord: (draft: PostDraft): Promise<string | null> => window.desktopApi.exportDraftToWord(toPlainObject(draft)),
  exportDraftImagesArchive: (draft: PostDraft): Promise<string | null> =>
    window.desktopApi.exportDraftImagesArchive(toPlainObject(draft)),
  getAppSettings: (): Promise<AppSettings> => window.desktopApi.getAppSettings(),
  saveAppSettings: (settings: AppSettings): Promise<AppSettings> => window.desktopApi.saveAppSettings(toPlainObject(settings)),
  getVideoToPostSettings: (): Promise<VideoToPostSettings> => window.desktopApi.getVideoToPostSettings(),
  saveVideoToPostSettings: (settings: VideoToPostSettings): Promise<VideoToPostSettings> =>
    window.desktopApi.saveVideoToPostSettings(toPlainObject(settings)),
  getVideoToPostConfigStatus: (): Promise<VideoToPostConfigStatus> => window.desktopApi.getVideoToPostConfigStatus(),
  getArticleRewriteSettings: (): Promise<ArticleRewriteSettings> => window.desktopApi.getArticleRewriteSettings(),
  saveArticleRewriteSettings: (settings: ArticleRewriteSettings): Promise<ArticleRewriteSettings> =>
    window.desktopApi.saveArticleRewriteSettings(toPlainObject(settings)),
  getArticleRewriteConfigStatus: (): Promise<ArticleRewriteConfigStatus> => window.desktopApi.getArticleRewriteConfigStatus(),
  getContentStudioSettings: (): Promise<ContentStudioSettings> => window.desktopApi.getContentStudioSettings(),
  saveContentStudioSettings: (settings: ContentStudioSettings): Promise<ContentStudioSettings> =>
    window.desktopApi.saveContentStudioSettings(toPlainObject(settings)),
  getContentStudioConfigStatus: (): Promise<ContentStudioConfigStatus> => window.desktopApi.getContentStudioConfigStatus(),
  checkContentStudioOpenCliHealth: (command?: string): Promise<OpenCliRuntimeHealthStatus> =>
    window.desktopApi.checkContentStudioOpenCliHealth(command),
  repairContentStudioOpenCliRuntime: (command?: string): Promise<OpenCliRuntimeHealthStatus> =>
    window.desktopApi.repairContentStudioOpenCliRuntime(command),
  testContentStudioModel: (options: TestContentStudioModelOptions): Promise<OpenCliProviderStatus> =>
    window.desktopApi.testContentStudioModel(toPlainObject(options)),
  listContentStudioTasks: (): Promise<ContentStudioTaskSummary[]> => window.desktopApi.listContentStudioTasks(),
  getContentStudioTaskById: (taskId: string): Promise<ContentStudioTask> => window.desktopApi.getContentStudioTaskById(taskId),
  deleteContentStudioTask: (taskId: string): Promise<void> => window.desktopApi.deleteContentStudioTask(taskId),
  runContentStudioTopic: (options: TopicCreateInput): Promise<ContentStudioTask> =>
    window.desktopApi.runContentStudioTopic(toPlainObject(options)),
  runContentStudioMaterial: (options: MaterialRewriteInput): Promise<ContentStudioTask> =>
    window.desktopApi.runContentStudioMaterial(toPlainObject(options)),
  addContentStudioMaterialText: (options: {
    topic?: string;
    title?: string;
    body: string;
    current?: ContentStudioMaterialPack;
    maxSourceCount?: number;
  }): Promise<ContentStudioMaterialPack> => window.desktopApi.addContentStudioMaterialText(toPlainObject(options)),
  addContentStudioMaterialUrl: (options: {
    url: string;
    title?: string;
    current?: ContentStudioMaterialPack;
    collectImagesFromUrl?: boolean;
    maxSourceCount?: number;
  }): Promise<ContentStudioMaterialPack> => window.desktopApi.addContentStudioMaterialUrl(toPlainObject(options)),
  addContentStudioMaterialWord: (options: {
    filePath: string;
    title?: string;
    current?: ContentStudioMaterialPack;
    maxSourceCount?: number;
  }): Promise<ContentStudioMaterialPack> => window.desktopApi.addContentStudioMaterialWord(toPlainObject(options)),
  saveContentStudioImagePlan: (taskId: string, updates: ContentStudioParagraphImagePlanUpdate[]): Promise<ContentStudioTask> =>
    window.desktopApi.saveContentStudioImagePlan(taskId, toPlainObject(updates)),
  addContentStudioLocalImage: (taskId: string, sourceImagePath: string): Promise<ContentStudioTask> =>
    window.desktopApi.addContentStudioLocalImage(taskId, sourceImagePath),
  bindContentStudioImage: (taskId: string, paragraphId: string, assetId: string): Promise<ContentStudioTask> =>
    window.desktopApi.bindContentStudioImage(taskId, paragraphId, assetId),
  unbindContentStudioImage: (taskId: string, paragraphId: string): Promise<ContentStudioTask> =>
    window.desktopApi.unbindContentStudioImage(taskId, paragraphId),
  deleteContentStudioImage: (taskId: string, assetId: string): Promise<ContentStudioTask> =>
    window.desktopApi.deleteContentStudioImage(taskId, assetId),
  buildContentStudioPublishDraft: (taskId: string): Promise<string> =>
    window.desktopApi.buildContentStudioPublishDraft(taskId),
  generateContentStudioAiImage: (taskId: string, options: ContentStudioGenerateImageOptions): Promise<ContentStudioTask> =>
    window.desktopApi.generateContentStudioAiImage(taskId, toPlainObject(options)),
  exportContentStudioWord: (taskId: string): Promise<string | null> =>
    window.desktopApi.exportContentStudioWord(taskId),
  exportContentStudioImages: (taskId: string): Promise<string | null> =>
    window.desktopApi.exportContentStudioImages(taskId),
  getWebToPostSettings: (): Promise<WebToPostSettings> => window.desktopApi.getWebToPostSettings(),
  saveWebToPostSettings: (settings: WebToPostSettings): Promise<WebToPostSettings> =>
    window.desktopApi.saveWebToPostSettings(toPlainObject(settings)),
  getWebToPostConfigStatus: (): Promise<WebToPostConfigStatus> => window.desktopApi.getWebToPostConfigStatus(),
  checkOpenCliHealth: (): Promise<OpenCliRuntimeHealthStatus> => window.desktopApi.checkOpenCliHealth(),
  repairOpenCliRuntime: (): Promise<OpenCliRuntimeHealthStatus> => window.desktopApi.repairOpenCliRuntime(),
  openOpenCliProviderLoginPage: (provider: OpenCliProvider, profile?: string): Promise<void> =>
    window.desktopApi.openOpenCliProviderLoginPage(provider, profile),
  testOpenCliProvider: (provider: OpenCliProvider, profile?: string): Promise<OpenCliProviderStatus> =>
    window.desktopApi.testOpenCliProvider(provider, profile),
  replaceDraftImage: (draftId: string, blockId: string, sourceImagePath: string): Promise<PostDraft> =>
    window.desktopApi.replaceDraftImage(draftId, blockId, sourceImagePath),
  previewDraftFrame: (draftId: string, options: ReplaceFrameAssetOptions): Promise<FramePreviewResult> =>
    window.desktopApi.previewDraftFrame(draftId, toPlainObject(options)),
  replaceDraftImageFromFrame: (
    draftId: string,
    blockId: string,
    options: ReplaceFrameAssetOptions
  ): Promise<PostDraft> => window.desktopApi.replaceDraftImageFromFrame(draftId, blockId, toPlainObject(options)),
  saveEditedFrame: (options: SaveEditedFrameOptions) => window.desktopApi.saveEditedFrame(toPlainObject(options)),
  rewriteParagraph: (options: RewriteParagraphOptions): Promise<string> => window.desktopApi.rewriteParagraph(toPlainObject(options)),
  rewriteDraft: (options: RewriteDraftOptions): Promise<PostDraft> => window.desktopApi.rewriteDraft(toPlainObject(options)),
  rewriteDraftIterative: (options: RewriteDraftIterativeOptions): Promise<PostDraft> =>
    window.desktopApi.rewriteDraftIterative(toPlainObject(options)),
  listWebTasks: (): Promise<WebTaskSummary[]> => window.desktopApi.listWebTasks(),
  getWebTaskById: (taskId: string): Promise<WebCrawlTask> => window.desktopApi.getWebTaskById(taskId),
  createWebTask: (title?: string): Promise<WebCrawlTask> => window.desktopApi.createWebTask(title),
  startWebCrawl: (taskId: string, options: WebCrawlStartOptions): Promise<WebCrawlTask> =>
    window.desktopApi.startWebCrawl(taskId, toPlainObject(options)),
  saveWebRecordBody: (taskId: string, options: ConfirmWebRecordBodyOptions): Promise<WebCrawlTask> =>
    window.desktopApi.saveWebRecordBody(taskId, toPlainObject(options)),
  retryWebRecordExtract: (taskId: string, options: { recordId: string; prompt: string }): Promise<WebCrawlTask> =>
    window.desktopApi.retryWebRecordExtract(taskId, toPlainObject(options)),
  collectWebRecordImages: (taskId: string, recordId: string): Promise<WebCrawlTask> =>
    window.desktopApi.collectWebRecordImages(taskId, recordId),
  rewriteWebTask: (taskId: string, options: RewriteWebTaskOptions): Promise<WebCrawlTask> =>
    window.desktopApi.rewriteWebTask(taskId, toPlainObject(options)),
  rewriteWebTaskIterative: (taskId: string, options: IterativeRewriteWebTaskOptions): Promise<WebCrawlTask> =>
    window.desktopApi.rewriteWebTaskIterative(taskId, toPlainObject(options)),
  saveWebRewriteResult: (taskId: string, options: SaveWebRewriteResultOptions): Promise<WebCrawlTask> =>
    window.desktopApi.saveWebRewriteResult(taskId, toPlainObject(options)),
  deleteWebRewriteHistory: (taskId: string, options: DeleteWebRewriteHistoryOptions): Promise<WebCrawlTask> =>
    window.desktopApi.deleteWebRewriteHistory(taskId, toPlainObject(options)),
  toggleWebImageSelection: (taskId: string, assetId: string, selected: boolean): Promise<WebCrawlTask> =>
    window.desktopApi.toggleWebImageSelection(taskId, assetId, selected),
  deleteWebRecord: (taskId: string, options: DeleteWebRecordOptions): Promise<WebCrawlTask> =>
    window.desktopApi.deleteWebRecord(taskId, toPlainObject(options)),
  deleteWebTask: (taskId: string): Promise<void> => window.desktopApi.deleteWebTask(taskId),
  renameWebTask: (taskId: string, title: string): Promise<WebCrawlTask> =>
    window.desktopApi.renameWebTask(taskId, title),
  exportWebTaskToWord: (taskId: string): Promise<string | null> => window.desktopApi.exportWebTaskToWord(taskId),
  autoExportWebTaskBundle: (taskId: string): Promise<WebTaskAutoExportResult> => window.desktopApi.autoExportWebTaskBundle(taskId),
  getMachineId: (): Promise<string> => window.desktopApi.getMachineId(),
  checkLicense: (): Promise<LicenseStatus> => window.desktopApi.checkLicense(),
  activateLicense: (licenseKey: string): Promise<LicenseStatus> => window.desktopApi.activateLicense(licenseKey),
  readImageAsDataUrl: (imagePath: string): Promise<string> => window.desktopApi.readImageAsDataUrl(imagePath),
  copyImageToClipboard: (imagePath: string): Promise<boolean> => window.desktopApi.copyImageToClipboard(imagePath),
  onTaskProgress: (callback: (progress: TaskProgress) => void): (() => void) =>
    window.desktopApi.onTaskProgress(callback),
  onWebTaskProgress: (callback: (progress: WebTaskProgress) => void): (() => void) =>
    window.desktopApi.onWebTaskProgress(callback),
  onContentStudioTopicProgress: (callback: (progress: ContentStudioTopicProgress) => void): (() => void) =>
    window.desktopApi.onContentStudioTopicProgress(callback),
  onContentStudioMaterialProgress: (callback: (progress: ContentStudioMaterialProgress) => void): (() => void) =>
    window.desktopApi.onContentStudioMaterialProgress(callback)
};
