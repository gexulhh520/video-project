import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import dotenv from "dotenv";
import { registerIpcHandlers } from "./ipc";
import { FfmpegService } from "./services/ffmpeg.service";
import { DoubaoAsrService } from "./services/doubao-asr.service";
import { TranscriptService } from "./services/transcript.service";
import { LlmService } from "./services/llm.service";
import { PostService } from "./services/post.service";

dotenv.config();

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0d1117",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  const ffmpegService = new FfmpegService();
  const doubaoAsrService = new DoubaoAsrService();
  const transcriptService = new TranscriptService(ffmpegService, doubaoAsrService);
  const llmService = new LlmService();
  const postService = new PostService(ffmpegService, transcriptService, llmService);
  registerIpcHandlers(mainWindow, postService);

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.openai.video-to-post");
  app.on("browser-window-created", (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
