import type { OpenCliRuntimeHealthStatus } from "../../types/app.types";
import { SettingsService } from "../settings.service";
import { OpenCliCommandRunner } from "./opencli-command-runner";
import { isLikelyOpenCliProfileId, parseOpenCliProfiles } from "./opencli-output-parser";

export class OpenCliRuntimeService {
  constructor(
    private readonly runner: OpenCliCommandRunner,
    private readonly settingsService: SettingsService
  ) {}

  async checkHealth(): Promise<OpenCliRuntimeHealthStatus> {
    const result = await this.runner.run(["doctor"], {
      timeoutMs: 30000,
      ignoreError: true
    });

    const merged = `${result.stdout}\n${result.stderr}`.trim();
    const profiles = parseOpenCliProfiles(merged);
    const connectedProfile = profiles.find(
      (item) => item.status === "connected" && isLikelyOpenCliProfileId(item.id)
    );

    return {
      healthy: Boolean(connectedProfile),
      checkedAt: new Date().toISOString(),
      message: connectedProfile
        ? `OpenCLI 已连接 Profile：${connectedProfile.id}`
        : "OpenCLI 未检测到 connected profile，请确认 Chrome 与 OpenCLI 扩展状态。",
      rawOutput: merged,
      profiles,
      selectedProfile: connectedProfile?.id
    };
  }

  async repair(): Promise<OpenCliRuntimeHealthStatus> {
    await this.runner.run(["daemon", "stop"], {
      timeoutMs: 15000,
      ignoreError: true
    });

    return this.checkHealth();
  }

  async ensureHealthy(): Promise<OpenCliRuntimeHealthStatus> {
    const first = await this.checkHealth();
    if (first.healthy) {
      await this.persistAutoDetectedProfile(first.selectedProfile);
      return first;
    }

    const repaired = await this.repair();
    if (!repaired.healthy) {
      throw new Error(repaired.rawOutput || "OpenCLI 修复后仍不可用。");
    }

    await this.persistAutoDetectedProfile(repaired.selectedProfile);
    return repaired;
  }

  async resolveActiveProfile(preferredProfile?: string): Promise<string> {
    const preferred = preferredProfile?.trim();
    if (preferred && isLikelyOpenCliProfileId(preferred)) {
      return preferred;
    }

    const settings = await this.settingsService.getWebToPostSettings();
    const configured = settings.openCliProfile?.trim();
    if (configured && isLikelyOpenCliProfileId(configured)) {
      return configured;
    }

    const health = await this.ensureHealthy();
    if (!health.selectedProfile || !isLikelyOpenCliProfileId(health.selectedProfile)) {
      throw new Error("未检测到可用的 OpenCLI Profile。");
    }

    return health.selectedProfile;
  }

  private async persistAutoDetectedProfile(profile?: string): Promise<void> {
    const normalized = profile?.trim();
    if (!normalized || !isLikelyOpenCliProfileId(normalized)) {
      return;
    }

    const currentSettings = await this.settingsService.getWebToPostSettings();
    if (currentSettings.openCliProfile?.trim() === normalized) {
      return;
    }

    await this.settingsService.saveWebToPostSettings({
      ...currentSettings,
      runtime: "opencli",
      openCliProfile: normalized
    });
  }
}

