import type {
  AppSettings,
  ConfirmWebRecordBodyOptions,
  DraftSummary,
  FramePreviewResult,
  GeneratePostOptions,
  PostDraft,
  ReplaceFrameAssetOptions,
  RewriteWebTaskOptions,
  RewriteParagraphOptions,
  TaskProgress,
  VideoToPostConfigStatus,
  VideoToPostSettings,
  WebCrawlStartOptions,
  WebCrawlTask,
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
  selectImage: (): Promise<string | null> => window.desktopApi.selectImage(),
  selectDirectory: (): Promise<string | null> => window.desktopApi.selectDirectory(),
  generatePost: (videoPath: string, options: GeneratePostOptions): Promise<PostDraft> =>
    window.desktopApi.generatePost(videoPath, options),
  listDrafts: (): Promise<DraftSummary[]> => window.desktopApi.listDrafts(),
  getDraftById: (draftId: string): Promise<PostDraft> => window.desktopApi.getDraftById(draftId),
  saveDraft: (draft: PostDraft): Promise<PostDraft> => window.desktopApi.saveDraft(toPlainObject(draft)),
  exportDraftToWord: (draft: PostDraft): Promise<string | null> => window.desktopApi.exportDraftToWord(toPlainObject(draft)),
  getAppSettings: (): Promise<AppSettings> => window.desktopApi.getAppSettings(),
  saveAppSettings: (settings: AppSettings): Promise<AppSettings> => window.desktopApi.saveAppSettings(toPlainObject(settings)),
  getVideoToPostSettings: (): Promise<VideoToPostSettings> => window.desktopApi.getVideoToPostSettings(),
  saveVideoToPostSettings: (settings: VideoToPostSettings): Promise<VideoToPostSettings> =>
    window.desktopApi.saveVideoToPostSettings(toPlainObject(settings)),
  getVideoToPostConfigStatus: (): Promise<VideoToPostConfigStatus> => window.desktopApi.getVideoToPostConfigStatus(),
  getWebToPostSettings: (): Promise<WebToPostSettings> => window.desktopApi.getWebToPostSettings(),
  saveWebToPostSettings: (settings: WebToPostSettings): Promise<WebToPostSettings> =>
    window.desktopApi.saveWebToPostSettings(toPlainObject(settings)),
  getWebToPostConfigStatus: (): Promise<WebToPostConfigStatus> => window.desktopApi.getWebToPostConfigStatus(),
  replaceDraftImage: (draftId: string, blockId: string, sourceImagePath: string): Promise<PostDraft> =>
    window.desktopApi.replaceDraftImage(draftId, blockId, sourceImagePath),
  previewDraftFrame: (draftId: string, options: ReplaceFrameAssetOptions): Promise<FramePreviewResult> =>
    window.desktopApi.previewDraftFrame(draftId, toPlainObject(options)),
  replaceDraftImageFromFrame: (
    draftId: string,
    blockId: string,
    options: ReplaceFrameAssetOptions
  ): Promise<PostDraft> => window.desktopApi.replaceDraftImageFromFrame(draftId, blockId, toPlainObject(options)),
  rewriteParagraph: (options: RewriteParagraphOptions): Promise<string> => window.desktopApi.rewriteParagraph(toPlainObject(options)),
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
  toggleWebImageSelection: (taskId: string, assetId: string, selected: boolean): Promise<WebCrawlTask> =>
    window.desktopApi.toggleWebImageSelection(taskId, assetId, selected),
  exportWebTaskToWord: (taskId: string): Promise<string | null> => window.desktopApi.exportWebTaskToWord(taskId),
  readImageAsDataUrl: (imagePath: string): Promise<string> => window.desktopApi.readImageAsDataUrl(imagePath),
  onTaskProgress: (callback: (progress: TaskProgress) => void): (() => void) =>
    window.desktopApi.onTaskProgress(callback),
  onWebTaskProgress: (callback: (progress: WebTaskProgress) => void): (() => void) =>
    window.desktopApi.onWebTaskProgress(callback)
};
