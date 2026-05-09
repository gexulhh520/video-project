import type { DraftSummary, PostDraft, TaskProgress } from "../../../main/types/app.types";

export const desktopApi = {
  selectVideo: (): Promise<string | null> => window.desktopApi.selectVideo(),
  generatePost: (videoPath: string): Promise<PostDraft> => window.desktopApi.generatePost(videoPath),
  listDrafts: (): Promise<DraftSummary[]> => window.desktopApi.listDrafts(),
  getDraftById: (draftId: string): Promise<PostDraft> => window.desktopApi.getDraftById(draftId),
  readImageAsDataUrl: (imagePath: string): Promise<string> => window.desktopApi.readImageAsDataUrl(imagePath),
  onTaskProgress: (callback: (progress: TaskProgress) => void): (() => void) =>
    window.desktopApi.onTaskProgress(callback)
};
