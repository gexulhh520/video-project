import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, DraftSummary, PostDraft, TaskProgress } from "../main/types/app.types";

const desktopApi: DesktopApi = {
  selectVideo: async () => ipcRenderer.invoke("video:select"),
  generatePost: async (videoPath: string): Promise<PostDraft> => ipcRenderer.invoke("post:generate", videoPath),
  listDrafts: async (): Promise<DraftSummary[]> => ipcRenderer.invoke("draft:list"),
  getDraftById: async (draftId: string): Promise<PostDraft> => ipcRenderer.invoke("draft:get", draftId),
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
