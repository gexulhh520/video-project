import type {
  AppSettings,
  DraftSummary,
  FramePreviewResult,
  GeneratePostOptions,
  PostDraft,
  TaskProgress,
  VideoToPostConfigStatus,
  VideoToPostSettings
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
  replaceDraftImage: (draftId: string, blockId: string, sourceImagePath: string): Promise<PostDraft> =>
    window.desktopApi.replaceDraftImage(draftId, blockId, sourceImagePath),
  previewDraftFrame: (draftId: string, timeSeconds: number): Promise<FramePreviewResult> =>
    window.desktopApi.previewDraftFrame(draftId, timeSeconds),
  replaceDraftImageFromFrame: (draftId: string, blockId: string, timeSeconds: number): Promise<PostDraft> =>
    window.desktopApi.replaceDraftImageFromFrame(draftId, blockId, timeSeconds),
  readImageAsDataUrl: (imagePath: string): Promise<string> => window.desktopApi.readImageAsDataUrl(imagePath),
  onTaskProgress: (callback: (progress: TaskProgress) => void): (() => void) =>
    window.desktopApi.onTaskProgress(callback)
};
