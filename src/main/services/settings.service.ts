import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "electron";
import type {
  AppSettings,
  GlobalRuntimeSettings,
  VideoToPostConfigStatus,
  VideoToPostSettings,
  WebToPostConfigStatus,
  WebToPostSettings
} from "../types/app.types";

type StoredSettings = Partial<AppSettings>;
type StoredVideoToPostSettings = Partial<VideoToPostSettings>;
type StoredWebToPostSettings = Partial<WebToPostSettings>;

const DEFAULT_VIDEO_TO_POST_SETTINGS: VideoToPostSettings = {
  doubaoAsrApiKey: "",
  llmApiKey: "",
  llmModel: "deepseek-v4-flash"
};

const DEFAULT_WEB_TO_POST_SETTINGS: WebToPostSettings = {
  llmApiKey: "",
  llmModel: "deepseek-v4-flash",
  bbBrowserCommand: "npx",
  bbBrowserArgs: "-y -p bb-browser bb-browser",
  bbBrowserMcpCommand: "npx",
  bbBrowserMcpArgs: "-y -p bb-browser bb-browser-mcp"
};

const DEFAULT_GLOBAL_RUNTIME_SETTINGS: GlobalRuntimeSettings = {
  llmBaseUrl: "https://api.deepseek.com",
  doubaoAsrBaseUrl: "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
  doubaoAsrResourceId: "volc.bigasr.auc_turbo",
  doubaoUid: "video-to-post-user"
};

export class SettingsService {
  private readonly settingsFilePath = join(app.getPath("userData"), "settings.json");

  async getSettings(): Promise<AppSettings> {
    const stored = await this.readStoredSettings();
    const workspaceDir = stored.workspaceDir?.trim() || this.getDefaultWorkspaceDir();
    await mkdir(workspaceDir, { recursive: true });
    return {
      workspaceDir,
      globalRuntime: this.normalizeGlobalRuntimeSettings(stored.globalRuntime),
      videoToPost: await this.getVideoToPostSettings(workspaceDir)
    };
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const workspaceDir = resolve(settings.workspaceDir.trim());
    await mkdir(workspaceDir, { recursive: true });

    const normalizedSettings: AppSettings = {
      workspaceDir,
      globalRuntime: this.normalizeGlobalRuntimeSettings(settings.globalRuntime)
    };

    await writeFile(this.settingsFilePath, JSON.stringify(normalizedSettings, null, 2), "utf8");
    return normalizedSettings;
  }

  async getVideoToPostSettings(workspaceDir?: string): Promise<VideoToPostSettings> {
    const resolvedWorkspaceDir = workspaceDir ? resolve(workspaceDir) : (await this.getSettings()).workspaceDir;
    const configPath = this.getVideoToPostConfigPath(resolvedWorkspaceDir);

    try {
      await access(configPath, constants.R_OK);
      const content = await readFile(configPath, "utf8");
      const stored = JSON.parse(content) as StoredVideoToPostSettings;
      return {
        doubaoAsrApiKey: stored.doubaoAsrApiKey?.trim() ?? "",
        llmApiKey: stored.llmApiKey?.trim() ?? "",
        llmModel: stored.llmModel?.trim() || DEFAULT_VIDEO_TO_POST_SETTINGS.llmModel
      };
    } catch {
      return { ...DEFAULT_VIDEO_TO_POST_SETTINGS };
    }
  }

  async saveVideoToPostSettings(settings: VideoToPostSettings): Promise<VideoToPostSettings> {
    const appSettings = await this.getSettings();
    const configPath = this.getVideoToPostConfigPath(appSettings.workspaceDir);
    await mkdir(join(appSettings.workspaceDir, "config"), { recursive: true });

    const normalizedSettings: VideoToPostSettings = {
      doubaoAsrApiKey: settings.doubaoAsrApiKey.trim(),
      llmApiKey: settings.llmApiKey.trim(),
      llmModel: settings.llmModel.trim() || DEFAULT_VIDEO_TO_POST_SETTINGS.llmModel
    };

    await writeFile(configPath, JSON.stringify(normalizedSettings, null, 2), "utf8");
    return normalizedSettings;
  }

  async getVideoToPostConfigStatus(): Promise<VideoToPostConfigStatus> {
    const toolSettings = await this.getVideoToPostSettings();
    const hasDoubaoAsrApiKey = Boolean(toolSettings.doubaoAsrApiKey || process.env.DOUBAO_ASR_API_KEY);
    const hasLlmApiKey = Boolean(toolSettings.llmApiKey || process.env.LLM_API_KEY);
    const resolvedLlmModel = toolSettings.llmModel || process.env.LLM_MODEL || DEFAULT_VIDEO_TO_POST_SETTINGS.llmModel;
    const missingItems: string[] = [];

    if (!hasDoubaoAsrApiKey) {
      missingItems.push("豆包 ASR Key");
    }

    if (!hasLlmApiKey) {
      missingItems.push("LLM Key");
    }

    return {
      ready: missingItems.length === 0,
      hasDoubaoAsrApiKey,
      hasLlmApiKey,
      resolvedLlmModel,
      missingItems
    };
  }

  async getWebToPostSettings(workspaceDir?: string): Promise<WebToPostSettings> {
    const resolvedWorkspaceDir = workspaceDir ? resolve(workspaceDir) : (await this.getSettings()).workspaceDir;
    const configPath = this.getWebToPostConfigPath(resolvedWorkspaceDir);

    try {
      await access(configPath, constants.R_OK);
      const content = await readFile(configPath, "utf8");
      const stored = JSON.parse(content) as StoredWebToPostSettings;
      return this.normalizeWebToPostSettings({
        llmApiKey: stored.llmApiKey?.trim() ?? "",
        llmModel: stored.llmModel?.trim() || DEFAULT_WEB_TO_POST_SETTINGS.llmModel,
        bbBrowserCommand: stored.bbBrowserCommand?.trim() || DEFAULT_WEB_TO_POST_SETTINGS.bbBrowserCommand,
        bbBrowserArgs: stored.bbBrowserArgs?.trim() || DEFAULT_WEB_TO_POST_SETTINGS.bbBrowserArgs,
        bbBrowserMcpCommand: stored.bbBrowserMcpCommand?.trim() || DEFAULT_WEB_TO_POST_SETTINGS.bbBrowserMcpCommand,
        bbBrowserMcpArgs: stored.bbBrowserMcpArgs?.trim() || DEFAULT_WEB_TO_POST_SETTINGS.bbBrowserMcpArgs
      });
    } catch {
      return { ...DEFAULT_WEB_TO_POST_SETTINGS };
    }
  }

  async saveWebToPostSettings(settings: WebToPostSettings): Promise<WebToPostSettings> {
    const appSettings = await this.getSettings();
    const configPath = this.getWebToPostConfigPath(appSettings.workspaceDir);
    await mkdir(join(appSettings.workspaceDir, "config"), { recursive: true });

    const normalizedSettings = this.normalizeWebToPostSettings({
      llmApiKey: settings.llmApiKey.trim(),
      llmModel: settings.llmModel.trim() || DEFAULT_WEB_TO_POST_SETTINGS.llmModel,
      bbBrowserCommand: settings.bbBrowserCommand.trim() || DEFAULT_WEB_TO_POST_SETTINGS.bbBrowserCommand,
      bbBrowserArgs: settings.bbBrowserArgs.trim() || DEFAULT_WEB_TO_POST_SETTINGS.bbBrowserArgs,
      bbBrowserMcpCommand: settings.bbBrowserMcpCommand.trim() || DEFAULT_WEB_TO_POST_SETTINGS.bbBrowserMcpCommand,
      bbBrowserMcpArgs: settings.bbBrowserMcpArgs.trim() || DEFAULT_WEB_TO_POST_SETTINGS.bbBrowserMcpArgs
    });

    await writeFile(configPath, JSON.stringify(normalizedSettings, null, 2), "utf8");
    return normalizedSettings;
  }

  async getWebToPostConfigStatus(): Promise<WebToPostConfigStatus> {
    const toolSettings = await this.getWebToPostSettings();
    const hasLlmApiKey = Boolean(toolSettings.llmApiKey || process.env.LLM_API_KEY);
    const hasBbBrowserCommand = Boolean(toolSettings.bbBrowserCommand.trim());
    const hasBbBrowserArgs = Boolean(toolSettings.bbBrowserArgs.trim());
    const hasBbBrowserMcpCommand = Boolean(toolSettings.bbBrowserMcpCommand.trim());
    const hasBbBrowserMcpArgs = Boolean(toolSettings.bbBrowserMcpArgs.trim());
    const resolvedLlmModel = toolSettings.llmModel || process.env.LLM_MODEL || DEFAULT_WEB_TO_POST_SETTINGS.llmModel;
    const missingItems: string[] = [];

    if (!hasLlmApiKey) {
      missingItems.push("LLM Key");
    }

    if (!hasBbBrowserCommand || !hasBbBrowserArgs) {
      missingItems.push("bb-browser CLI 命令");
    }

    if (!hasBbBrowserMcpCommand || !hasBbBrowserMcpArgs) {
      missingItems.push("bb-browser MCP 命令");
    }

    return {
      ready: missingItems.length === 0,
      hasLlmApiKey,
      hasBbBrowserCommand,
      resolvedLlmModel,
      missingItems
    };
  }

  private async readStoredSettings(): Promise<StoredSettings> {
    try {
      await access(this.settingsFilePath, constants.R_OK);
      const content = await readFile(this.settingsFilePath, "utf8");
      return JSON.parse(content) as StoredSettings;
    } catch {
      return {};
    }
  }

  private getDefaultWorkspaceDir(): string {
    if (!app.isPackaged) {
      return resolve(process.cwd(), "app-data");
    }

    return join(app.getPath("documents"), "VideoToPostWorkspace");
  }

  private getVideoToPostConfigPath(workspaceDir: string): string {
    return join(workspaceDir, "config", "video-to-post.json");
  }

  private getWebToPostConfigPath(workspaceDir: string): string {
    return join(workspaceDir, "config", "web-to-post.json");
  }

  private normalizeWebToPostSettings(settings: WebToPostSettings): WebToPostSettings {
    const normalized = {
      ...settings
    };

    const cliArgs = normalized.bbBrowserArgs.trim();
    const mcpArgs = normalized.bbBrowserMcpArgs.trim();

    if (
      normalized.bbBrowserCommand.trim().toLowerCase() === "bb-browser" &&
      /(^|\s)-p\s+bb-browser(\s|$)/i.test(cliArgs)
    ) {
      normalized.bbBrowserCommand = "npx";
    }

    if (
      normalized.bbBrowserMcpCommand.trim().toLowerCase() === "bb-browser" &&
      /(^|\s)-p\s+bb-browser(\s|$)/i.test(mcpArgs)
    ) {
      normalized.bbBrowserMcpCommand = "npx";
    }

    if (!normalized.bbBrowserArgs.trim()) {
      normalized.bbBrowserArgs = DEFAULT_WEB_TO_POST_SETTINGS.bbBrowserArgs;
    }

    if (!normalized.bbBrowserMcpArgs.trim()) {
      normalized.bbBrowserMcpArgs = DEFAULT_WEB_TO_POST_SETTINGS.bbBrowserMcpArgs;
    }

    return normalized;
  }

  private normalizeGlobalRuntimeSettings(settings?: Partial<GlobalRuntimeSettings>): GlobalRuntimeSettings {
    return {
      llmBaseUrl: settings?.llmBaseUrl?.trim() || DEFAULT_GLOBAL_RUNTIME_SETTINGS.llmBaseUrl,
      doubaoAsrBaseUrl: settings?.doubaoAsrBaseUrl?.trim() || DEFAULT_GLOBAL_RUNTIME_SETTINGS.doubaoAsrBaseUrl,
      doubaoAsrResourceId: settings?.doubaoAsrResourceId?.trim() || DEFAULT_GLOBAL_RUNTIME_SETTINGS.doubaoAsrResourceId,
      doubaoUid: settings?.doubaoUid?.trim() || DEFAULT_GLOBAL_RUNTIME_SETTINGS.doubaoUid
    };
  }
}
