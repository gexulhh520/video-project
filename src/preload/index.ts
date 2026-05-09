import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, DraftSummary, FramePreviewResult, PostDraft, TaskProgress } from "../main/types/app.types";

const desktopApi: DesktopApi = {
  selectVideo: async () => ipcRenderer.invoke("video:select"),
  selectImage: async () => ipcRenderer.invoke("image:select"),
  generatePost: async (videoPath: string): Promise<PostDraft> => ipcRenderer.invoke("post:generate", videoPath),
  listDrafts: async (): Promise<DraftSummary[]> => ipcRenderer.invoke("draft:list"),
  getDraftById: async (draftId: string): Promise<PostDraft> => ipcRenderer.invoke("draft:get", draftId),
  saveDraft: async (draft: PostDraft): Promise<PostDraft> => ipcRenderer.invoke("draft:save", draft),
  replaceDraftImage: async (draftId: string, blockId: string, sourceImagePath: string): Promise<PostDraft> =>
    ipcRenderer.invoke("draft:replace-image", draftId, blockId, sourceImagePath),
  previewDraftFrame: async (draftId: string, timeSeconds: number): Promise<FramePreviewResult> =>
    ipcRenderer.invoke("draft:preview-frame", draftId, timeSeconds),
  replaceDraftImageFromFrame: async (draftId: string, blockId: string, timeSeconds: number): Promise<PostDraft> =>
    ipcRenderer.invoke("draft:replace-image-from-frame", draftId, blockId, timeSeconds),
  readImageAsDataUrl: async (imagePath: string): Promise<string> => ipcRenderer.invoke("image:read-data-url", imagePath),
  onTaskProgress: (callback: (progress: TaskProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: TaskProgress): void => {
      callback(progress);
    };

    ipcRenderer.on("task:progress", listener);
    return () => {
      ipcRenderer.removeListener("task:progress", listener);
    };
  }
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
