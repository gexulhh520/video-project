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
import { SettingsService } from "./services/settings.service";
import { ImageEditService } from "./services/image-edit.service";
import { BrowserRuntimeService } from "./services/browser-runtime.service";
import { BbBrowserService } from "./services/bb-browser.service";
import { WebTaskService } from "./services/web-task.service";
import { ArticleRewriteService } from "./services/article-rewrite.service";
import { OpenCliCommandRunner } from "./services/opencli/opencli-command-runner";
import { OpenCliRuntimeService } from "./services/opencli/opencli-runtime.service";
import { OpenCliBrowserService } from "./services/opencli/opencli-browser.service";
import { OpenCliWebLlmService } from "./services/opencli/opencli-web-llm.service";
import { OpenCliImageDownloader } from "./services/opencli/opencli-image-downloader";
import { OpenCliWebTaskService } from "./services/opencli/opencli-web-task.service";
import { ContentStudioDebateService } from "./services/content-studio/content-studio-debate.service";
import { ContentStudioOpenCliClient } from "./services/content-studio/content-studio-opencli-client";
import { ContentStudioSettingsService } from "./services/content-studio/content-studio-settings.service";
import { ContentStudioTaskStore } from "./services/content-studio/content-studio-task-store";
import { ContentStudioService } from "./services/content-studio/content-studio.service";
import { ContentStudioLayoutService } from "./services/content-studio/content-studio-layout.service";
import { ContentStudioExportService } from "./services/content-studio/content-studio-export.service";
import { ContentStudioImageService } from "./services/content-studio/content-studio-image.service";

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

  const settingsService = new SettingsService();
  const ffmpegService = new FfmpegService();
  const doubaoAsrService = new DoubaoAsrService(settingsService);
  const transcriptService = new TranscriptService(ffmpegService, doubaoAsrService);
  const openCliCommandRunner = new OpenCliCommandRunner();
  const openCliRuntimeService = new OpenCliRuntimeService(openCliCommandRunner, settingsService);
  const openCliBrowserService = new OpenCliBrowserService(openCliCommandRunner);
  const openCliWebLlmService = new OpenCliWebLlmService(openCliCommandRunner);
  const openCliImageDownloader = new OpenCliImageDownloader();
  const llmService = new LlmService(settingsService, openCliRuntimeService, openCliWebLlmService);
  const postService = new PostService(ffmpegService, transcriptService, llmService, settingsService);
  const imageEditService = new ImageEditService(postService, settingsService);
  const browserRuntimeService = new BrowserRuntimeService(settingsService);
  const bbBrowserService = new BbBrowserService(settingsService);
  const webTaskService = new WebTaskService(settingsService, llmService, browserRuntimeService, bbBrowserService);
  const openCliWebTaskService = new OpenCliWebTaskService(
    settingsService,
    openCliRuntimeService,
    openCliBrowserService,
    openCliWebLlmService,
    openCliImageDownloader
  );
  const articleRewriteService = new ArticleRewriteService(settingsService, llmService);
  const contentStudioSettingsService = new ContentStudioSettingsService(settingsService, openCliWebLlmService);
  const contentStudioTaskStore = new ContentStudioTaskStore(settingsService);
  const contentStudioOpenCliClient = new ContentStudioOpenCliClient(openCliWebLlmService);
  const contentStudioDebateService = new ContentStudioDebateService(contentStudioOpenCliClient);
  const contentStudioService = new ContentStudioService(
    contentStudioTaskStore,
    contentStudioSettingsService,
    contentStudioDebateService
  );
  const contentStudioImageService = new ContentStudioImageService(
    contentStudioSettingsService,
    openCliCommandRunner,
    settingsService
  );
  const contentStudioLayoutService = new ContentStudioLayoutService(contentStudioTaskStore, contentStudioImageService);
  const contentStudioExportService = new ContentStudioExportService(contentStudioTaskStore);
  registerIpcHandlers(
    mainWindow,
    postService,
    settingsService,
    webTaskService,
    openCliWebTaskService,
    openCliRuntimeService,
    openCliWebLlmService,
    imageEditService,
    articleRewriteService,
    contentStudioSettingsService,
    contentStudioService,
    contentStudioLayoutService,
    contentStudioExportService
  );

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
