import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "electron";
import type { AppSettings, VideoToPostConfigStatus, VideoToPostSettings } from "../types/app.types";

type StoredSettings = Partial<AppSettings>;
type StoredVideoToPostSettings = Partial<VideoToPostSettings>;

const DEFAULT_VIDEO_TO_POST_SETTINGS: VideoToPostSettings = {
  doubaoAsrApiKey: "",
  llmApiKey: "",
  llmModel: "deepseek-v4-flash"
};

export class SettingsService {
  private readonly settingsFilePath = join(app.getPath("userData"), "settings.json");

  async getSettings(): Promise<AppSettings> {
    const stored = await this.readStoredSettings();
    const workspaceDir = stored.workspaceDir?.trim() || this.getDefaultWorkspaceDir();
    await mkdir(workspaceDir, { recursive: true });
    return {
      workspaceDir,
      videoToPost: await this.getVideoToPostSettings(workspaceDir)
    };
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const workspaceDir = resolve(settings.workspaceDir.trim());
    await mkdir(workspaceDir, { recursive: true });

    const normalizedSettings: AppSettings = {
      workspaceDir
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
}
