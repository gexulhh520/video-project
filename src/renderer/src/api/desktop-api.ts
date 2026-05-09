import type { DraftSummary, FramePreviewResult, PostDraft, TaskProgress } from "../../../main/types/app.types";

function toPlainObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const desktopApi = {
  selectVideo: (): Promise<string | null> => window.desktopApi.selectVideo(),
  selectImage: (): Promise<string | null> => window.desktopApi.selectImage(),
  generatePost: (videoPath: string): Promise<PostDraft> => window.desktopApi.generatePost(videoPath),
  listDrafts: (): Promise<DraftSummary[]> => window.desktopApi.listDrafts(),
  getDraftById: (draftId: string): Promise<PostDraft> => window.desktopApi.getDraftById(draftId),
  saveDraft: (draft: PostDraft): Promise<PostDraft> => window.desktopApi.saveDraft(toPlainObject(draft)),
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
