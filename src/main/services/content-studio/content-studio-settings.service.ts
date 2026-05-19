import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import type { OpenCliProvider, OpenCliRuntimeHealthStatus } from "../../types/app.types";
import type {
  ContentStudioConfigStatus,
  ContentStudioModelConfig,
  ContentStudioSettings,
  ContentStudioTabConfigStatus,
  ContentStudioTabKey,
  ContentStudioTabModelSettings,
  TestContentStudioModelOptions
} from "../../types/content-studio.types";
import { CONTENT_STUDIO_TAB_KEYS } from "../../types/content-studio.types";
import { SettingsService } from "../settings.service";
import { OpenCliWebLlmService } from "../opencli/opencli-web-llm.service";
import { OpenCliCommandRunner } from "../opencli/opencli-command-runner";
import { OpenCliRuntimeService } from "../opencli/opencli-runtime.service";

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_DEBATE_ROUNDS = 2;
const DEFAULT_TOPIC_ADVANCED_SETTINGS = {
  reviewRounds: 2,
  targetReader: "",
  writingStyle: "",
  wordRange: "1200-1800字",
  generateTitleCandidates: true,
  generateCoverText: true,
  generateImagePlan: true,
  enableTopicResearch: false,
  maxMaterialCount: 5,
  materialSummaryMaxWords: 500,
  materialSearchMode: "sequential",
  requireRiskNotes: true,
  requireSourceUrl: true
} as const;

export const DEFAULT_CONTENT_STUDIO_SETTINGS: ContentStudioSettings = {
  openCliCommand: "opencli",
  tabs: {
    topic: {
      modelA: {
        provider: "chatgpt",
        profile: "",
        roleName: "选题策划编辑",
        enabled: true
      },
      modelB: {
        provider: "claude",
        profile: "",
        roleName: "反方审稿总编",
        enabled: true
      },
      debateRounds: DEFAULT_DEBATE_ROUNDS,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS
    },
    material: {
      modelA: {
        provider: "chatgpt",
        profile: "",
        roleName: "素材重组编辑",
        enabled: true
      },
      modelB: {
        provider: "claude",
        profile: "",
        roleName: "相似度与事实审稿人",
        enabled: true
      },
      debateRounds: DEFAULT_DEBATE_ROUNDS,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS
    },
    hot: {
      modelA: {
        provider: "chatgpt",
        profile: "",
        roleName: "热点选题策划",
        enabled: true
      },
      modelB: {
        provider: "claude",
        profile: "",
        roleName: "热点事实风控审稿人",
        enabled: true
      },
      debateRounds: DEFAULT_DEBATE_ROUNDS,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS
    },
    layout: {
      modelA: {
        provider: "chatgpt",
        profile: "",
        roleName: "图文排版策划",
        enabled: true
      },
      modelB: {
        provider: "claude",
        profile: "",
        roleName: "配图与发布审稿人",
        enabled: true
      },
      debateRounds: 1,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      timeoutMs: DEFAULT_TIMEOUT_MS
    }
  },
  image: {
    enabled: false,
    provider: "chatgpt",
    profile: ""
  },
  topicAdvanced: {
    ...DEFAULT_TOPIC_ADVANCED_SETTINGS
  }
};

export class ContentStudioSettingsService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly openCliWebLlmService: OpenCliWebLlmService
  ) {}

  async getSettings(): Promise<ContentStudioSettings> {
    const configPath = await this.getConfigPath();

    try {
      await access(configPath, constants.R_OK);
      const content = await readFile(configPath, "utf8");
      const stored = JSON.parse(content) as Partial<ContentStudioSettings>;
      return this.normalizeSettings(stored);
    } catch {
      return this.normalizeSettings({});
    }
  }

  async saveSettings(settings: ContentStudioSettings): Promise<ContentStudioSettings> {
    const workspaceDir = (await this.settingsService.getSettings()).workspaceDir;
    await mkdir(join(workspaceDir, "config"), { recursive: true });
    const configPath = await this.getConfigPath();
    const normalized = this.normalizeSettings(settings);
    await writeFile(configPath, JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  }

  async getWorkspaceDir(): Promise<string> {
    return (await this.settingsService.getSettings()).workspaceDir;
  }

  async getConfigStatus(): Promise<ContentStudioConfigStatus> {
    const settings = await this.getSettings();
    const hasOpenCliCommand = Boolean(settings.openCliCommand.trim());

    const tabStatuses = Object.fromEntries(
      CONTENT_STUDIO_TAB_KEYS.map((tab) => [tab, this.getTabStatus(tab, settings.tabs[tab])])
    ) as Record<ContentStudioTabKey, ContentStudioTabConfigStatus>;

    const hasAtLeastOneTabReady = CONTENT_STUDIO_TAB_KEYS.some((tab) => tabStatuses[tab].ready);
    const missingItems: string[] = [];

    if (!hasOpenCliCommand) {
      missingItems.push("OpenCLI 命令");
    }

    if (!hasAtLeastOneTabReady) {
      missingItems.push("至少完成一个选项卡的模型配置");
    }

    return {
      ready: hasOpenCliCommand && hasAtLeastOneTabReady,
      hasOpenCliCommand,
      hasAtLeastOneTabReady,
      tabs: tabStatuses,
      missingItems
    };
  }

  async checkOpenCliHealth(commandOverride?: string): Promise<OpenCliRuntimeHealthStatus> {
    const command = await this.resolveOpenCliCommand(commandOverride);
    const runtimeService = this.createRuntimeService(command);
    return runtimeService.checkHealth();
  }

  async repairOpenCliRuntime(commandOverride?: string): Promise<OpenCliRuntimeHealthStatus> {
    const command = await this.resolveOpenCliCommand(commandOverride);
    const runtimeService = this.createRuntimeService(command);
    return runtimeService.repair();
  }

  async testModel(options: TestContentStudioModelOptions): Promise<{ provider: OpenCliProvider; profile?: string; ready: boolean; message: string; rawOutput?: string }> {
    const profile = options.profile.trim();
    if (!profile) {
      return {
        provider: options.provider,
        profile,
        ready: false,
        message: "请先填写 Profile"
      };
    }

    return this.openCliWebLlmService.testProvider(options.provider, profile);
  }

  private getTabStatus(tab: ContentStudioTabKey, settings: ContentStudioTabModelSettings): ContentStudioTabConfigStatus {
    const missingItems: string[] = [];
    const hasAnyModelEnabled = settings.modelA.enabled || settings.modelB.enabled;

    if (!hasAnyModelEnabled) {
      missingItems.push("至少启用一个模型");
    }

    this.collectModelMissingItems("模型 A", settings.modelA, missingItems);
    this.collectModelMissingItems("模型 B", settings.modelB, missingItems);

    return {
      tab,
      ready: hasAnyModelEnabled && missingItems.length === 0,
      missingItems,
      hasAnyModelEnabled
    };
  }

  private createRuntimeService(command: string): OpenCliRuntimeService {
    return new OpenCliRuntimeService(new OpenCliCommandRunner(command), this.settingsService);
  }

  private async resolveOpenCliCommand(commandOverride?: string): Promise<string> {
    const trimmed = commandOverride?.trim();
    if (trimmed) {
      return trimmed;
    }

    const settings = await this.getSettings();
    return settings.openCliCommand.trim() || DEFAULT_CONTENT_STUDIO_SETTINGS.openCliCommand;
  }

  private collectModelMissingItems(prefix: string, model: ContentStudioModelConfig, missingItems: string[]): void {
    if (!model.enabled) {
      return;
    }

    if (!model.profile.trim()) {
      missingItems.push(`${prefix} Profile`);
    }

    if (!model.roleName.trim()) {
      missingItems.push(`${prefix} 角色名称`);
    }
  }

  private async getConfigPath(): Promise<string> {
    const workspaceDir = (await this.settingsService.getSettings()).workspaceDir;
    return join(workspaceDir, "config", "content-studio.json");
  }

  private normalizeSettings(settings: Partial<ContentStudioSettings>): ContentStudioSettings {
    return {
      openCliCommand: settings.openCliCommand?.trim() || DEFAULT_CONTENT_STUDIO_SETTINGS.openCliCommand,
      tabs: {
        topic: this.normalizeTabSettings("topic", settings.tabs?.topic),
        material: this.normalizeTabSettings("material", settings.tabs?.material),
        hot: this.normalizeTabSettings("hot", settings.tabs?.hot),
        layout: this.normalizeTabSettings("layout", settings.tabs?.layout)
      },
      image: {
        enabled: Boolean(settings.image?.enabled),
        provider: this.normalizeProvider(settings.image?.provider),
        profile: settings.image?.profile?.trim() ?? "",
        outputDir: settings.image?.outputDir?.trim() || undefined
      },
      topicAdvanced: this.normalizeTopicAdvancedSettings(settings.topicAdvanced)
    };
  }

  private normalizeTabSettings(tab: ContentStudioTabKey, settings?: Partial<ContentStudioTabModelSettings>): ContentStudioTabModelSettings {
    const fallback = DEFAULT_CONTENT_STUDIO_SETTINGS.tabs[tab];

    return {
      modelA: this.normalizeModelConfig(settings?.modelA, fallback.modelA),
      modelB: this.normalizeModelConfig(settings?.modelB, fallback.modelB),
      debateRounds: this.normalizePositiveNumber(settings?.debateRounds, fallback.debateRounds),
      pollIntervalMs: this.normalizePositiveNumber(settings?.pollIntervalMs, fallback.pollIntervalMs),
      timeoutMs: this.normalizePositiveNumber(settings?.timeoutMs, fallback.timeoutMs)
    };
  }

  private normalizeModelConfig(
    model: Partial<ContentStudioModelConfig> | undefined,
    fallback: ContentStudioModelConfig
  ): ContentStudioModelConfig {
    return {
      provider: this.normalizeProvider(model?.provider) || fallback.provider,
      profile: model?.profile?.trim() ?? "",
      roleName: model?.roleName?.trim() || fallback.roleName,
      model: model?.model?.trim() || undefined,
      enabled: typeof model?.enabled === "boolean" ? model.enabled : fallback.enabled
    };
  }

  private normalizeProvider(provider: OpenCliProvider | undefined): OpenCliProvider {
    const providers: OpenCliProvider[] = ["chatgpt", "gemini", "claude", "grok", "doubao", "yuanbao"];
    if (provider && providers.includes(provider)) {
      return provider;
    }

    return "chatgpt";
  }

  private normalizePositiveNumber(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
      return fallback;
    }

    return Math.floor(value);
  }

  private normalizeTopicAdvancedSettings(settings: Partial<ContentStudioSettings["topicAdvanced"]> | undefined): ContentStudioSettings["topicAdvanced"] {
    return {
      reviewRounds: Math.min(
        5,
        Math.max(
          1,
          this.normalizePositiveNumber(settings?.reviewRounds, DEFAULT_TOPIC_ADVANCED_SETTINGS.reviewRounds)
        )
      ),
      targetReader: settings?.targetReader?.trim() ?? DEFAULT_TOPIC_ADVANCED_SETTINGS.targetReader,
      writingStyle: settings?.writingStyle?.trim() ?? DEFAULT_TOPIC_ADVANCED_SETTINGS.writingStyle,
      wordRange: settings?.wordRange?.trim() || DEFAULT_TOPIC_ADVANCED_SETTINGS.wordRange,
      generateTitleCandidates:
        typeof settings?.generateTitleCandidates === "boolean"
          ? settings.generateTitleCandidates
          : DEFAULT_TOPIC_ADVANCED_SETTINGS.generateTitleCandidates,
      generateCoverText:
        typeof settings?.generateCoverText === "boolean"
          ? settings.generateCoverText
          : DEFAULT_TOPIC_ADVANCED_SETTINGS.generateCoverText,
      generateImagePlan:
        typeof settings?.generateImagePlan === "boolean"
          ? settings.generateImagePlan
          : DEFAULT_TOPIC_ADVANCED_SETTINGS.generateImagePlan,
      enableTopicResearch:
        typeof settings?.enableTopicResearch === "boolean"
          ? settings.enableTopicResearch
          : DEFAULT_TOPIC_ADVANCED_SETTINGS.enableTopicResearch,
      maxMaterialCount: Math.min(
        10,
        Math.max(
          1,
          this.normalizePositiveNumber(settings?.maxMaterialCount, DEFAULT_TOPIC_ADVANCED_SETTINGS.maxMaterialCount)
        )
      ),
      materialSummaryMaxWords: Math.min(
        2000,
        Math.max(
          100,
          this.normalizePositiveNumber(
            settings?.materialSummaryMaxWords,
            DEFAULT_TOPIC_ADVANCED_SETTINGS.materialSummaryMaxWords
          )
        )
      ),
      materialSearchMode: "sequential",
      requireRiskNotes:
        typeof settings?.requireRiskNotes === "boolean"
          ? settings.requireRiskNotes
          : DEFAULT_TOPIC_ADVANCED_SETTINGS.requireRiskNotes,
      requireSourceUrl:
        typeof settings?.requireSourceUrl === "boolean"
          ? settings.requireSourceUrl
          : DEFAULT_TOPIC_ADVANCED_SETTINGS.requireSourceUrl
    };
  }
}
