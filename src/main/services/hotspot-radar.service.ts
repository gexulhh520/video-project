import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SettingsService } from "./settings.service";
import { OpenCliCommandRunner } from "./opencli/opencli-command-runner";
import type { OpenCliProvider } from "../types/app.types";
import { OpenCliWebLlmService } from "./opencli/opencli-web-llm.service";

type RawFilePayload = {
  taskId: string;
  accountId: string;
  watcherId: string;
  source: string;
  command: string;
  keyword: string | null;
  executedCommand: string;
  collectedAt: string;
  success: boolean;
  errorMessage: string | null;
  rawOutput: unknown;
};

export type HotspotRadarSourceConfig = {
  source: string;
  enabled: boolean;
  enabledCommands: string[];
  topLimit?: number;
  searchLimit?: number;
};

export type HotspotRadarAccount = {
  id: string;
  accountName: string;
  platform: string;
  contentStyle: string;
  mainTopics: string[];
  targetAudience: string[];
  tone: string;
  avoidTopics: string[];
  preferredContentTypes: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HotspotRadarWatcher = {
  id: string;
  accountId: string;
  name: string;
  description?: string;
  enabled: boolean;
  sources: HotspotRadarSourceConfig[];
  keywords: string[];
  runIntervalMinutes: number;
  dedupeLookbackDays: number;
  maxCandidatesPerRun: number;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
};


type RoughDecision = "candidate_keep" | "candidate_review" | "discard" | "blocked";
type FinalDecision = "keep_high" | "keep_normal" | "review" | "discard" | "blocked";

const FINAL_DECISION_SET = new Set<FinalDecision>(["keep_high", "keep_normal", "review", "discard", "blocked"]);
const ALLOWED_COLLECTION_COMMANDS = new Set([
  "hot","search","news","ranking","trending","top","latest","feed","today","popular","frontpage","best","new","recommend","articles","explore","browse","posts"
]);


type NormalizedItem = {
  title: string;
  summary: string;
  url: string;
  content: string;
  author: string;
  publishTime: string;
  heat: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  source: string;
  sourceCommand: string;
  matchedKeyword: string;
  rawItemIndex: number;
};

export type HotspotManualRunResult = {
  taskId: string;
  rawFileCount: number;
  standardizedCount: number;
  dedupedCount: number;
  candidateCount: number;
};


export type HotspotRadarLlmConfig = {
  provider: OpenCliProvider;
  profile: string;
  model?: string;
  timeoutMs?: number;
  intervalMs?: number;
};



export type HotspotRadarTaskSummary = {
  id: string;
  watcherId: string;
  status: string;
  rawFileCount: number;
  standardizedCount: number;
  dedupedCount: number;
  savedCount: number;
  createdAt: string;
  filePath: string;
};

export type HotspotRadarCandidateSummary = {
  id: string;
  title: string;
  source: string;
  matchedKeyword: string;
  status: string;
  finalDecision?: string;
  finalScore?: number;
  createdAt: string;
  filePath: string;
};

export type HotspotRadarSavedSummary = {
  id: string;
  recommendedTopic: string;
  hotspotTitle: string;
  source: string;
  decision: string;
  score: number;
  createdAt: string;
  filePath: string;
};

export type HotspotRadarGlobalConfig = {
  opencliProfile: string;
  dedupeLookbackDays: number;
  llm: HotspotRadarLlmConfig;
};

export class HotspotRadarService {
  constructor(private readonly settingsService: SettingsService, private readonly openCliRunner: OpenCliCommandRunner, private readonly openCliWebLlmService: OpenCliWebLlmService) {}

  async createAccount(input: Omit<HotspotRadarAccount, "createdAt" | "updatedAt">): Promise<HotspotRadarAccount> {
    const now = new Date().toISOString();
    const account = { ...input, createdAt: now, updatedAt: now };
    const dir = await this.accountDir(account.id);
    await mkdir(join(dir, "watchers"), { recursive: true });
    await mkdir(join(dir, "indexes"), { recursive: true });
    await writeFile(join(dir, "account.json"), JSON.stringify(account, null, 2), "utf8");
    return account;
  }

  async listAccounts(): Promise<HotspotRadarAccount[]> {
    const root = await this.accountsDir();
    await mkdir(root, { recursive: true });
    const entries = await readdir(root, { withFileTypes: true });
    const accounts: HotspotRadarAccount[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const file = join(root, e.name, "account.json");
      try {
        const v = JSON.parse(await readFile(file, "utf8")) as HotspotRadarAccount;
        accounts.push(v);
      } catch {}
    }
    return accounts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }


  async getAccountById(accountId: string): Promise<HotspotRadarAccount | null> {
    const file = join(await this.accountDir(accountId), "account.json");
    return this.readJson<HotspotRadarAccount | null>(file, null);
  }

  async deleteAccount(accountId: string): Promise<void> {
    await rm(await this.accountDir(accountId), { recursive: true, force: true });
  }

  async listWatchers(accountId: string): Promise<HotspotRadarWatcher[]> {
    const dir = join(await this.accountDir(accountId), "watchers");
    let entries: Array<{ isFile: () => boolean; name: string }> = [];
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as Array<{ isFile: () => boolean; name: string }>;
    } catch {
      return [];
    }
    const watchers: HotspotRadarWatcher[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const file = join(dir, entry.name);
      const watcher = await this.readJson<HotspotRadarWatcher | null>(file, null);
      if (watcher) watchers.push(watcher);
    }
    return watchers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getWatcherById(accountId: string, watcherId: string): Promise<HotspotRadarWatcher | null> {
    const file = join(await this.accountDir(accountId), "watchers", `${watcherId}.json`);
    return this.readJson<HotspotRadarWatcher | null>(file, null);
  }

  async deleteWatcher(accountId: string, watcherId: string): Promise<void> {
    const file = join(await this.accountDir(accountId), "watchers", `${watcherId}.json`);
    await rm(file, { force: true });
  }

  async getGlobalConfig(): Promise<HotspotRadarGlobalConfig> {
    const file = join(await this.dataRoot(), "config.json");
    const fallback: HotspotRadarGlobalConfig = {
      opencliProfile: "default",
      dedupeLookbackDays: 15,
      llm: { provider: "chatgpt", profile: "", timeoutMs: 120000, intervalMs: 3000 }
    };
    return this.readJson<HotspotRadarGlobalConfig>(file, fallback);
  }

  async saveGlobalConfig(input: HotspotRadarGlobalConfig): Promise<HotspotRadarGlobalConfig> {
    const file = join(await this.dataRoot(), "config.json");
    await mkdir(await this.dataRoot(), { recursive: true });
    const next: HotspotRadarGlobalConfig = {
      opencliProfile: input.opencliProfile?.trim() || "default",
      dedupeLookbackDays: input.dedupeLookbackDays > 0 ? input.dedupeLookbackDays : 15,
      llm: {
        provider: input.llm?.provider || "chatgpt",
        profile: input.llm?.profile?.trim() || "",
        model: input.llm?.model?.trim() || undefined,
        timeoutMs: input.llm?.timeoutMs && input.llm.timeoutMs > 0 ? input.llm.timeoutMs : 120000,
        intervalMs: input.llm?.intervalMs && input.llm.intervalMs > 0 ? input.llm.intervalMs : 3000
      }
    };
    await writeFile(file, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  async upsertWatcher(input: Omit<HotspotRadarWatcher, "createdAt" | "updatedAt">): Promise<HotspotRadarWatcher> {
    const now = new Date().toISOString();
    const dir = join(await this.accountDir(input.accountId), "watchers");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${input.id}.json`);
    let createdAt = now;
    try {
      const prev = JSON.parse(await readFile(file, "utf8")) as HotspotRadarWatcher;
      createdAt = prev.createdAt;
    } catch {}
    const watcher: HotspotRadarWatcher = { ...input, createdAt, updatedAt: now };
    await writeFile(file, JSON.stringify(watcher, null, 2), "utf8");
    return watcher;
  }


  async listTaskSummaries(accountId: string): Promise<HotspotRadarTaskSummary[]> {
    const file = join(await this.accountDir(accountId), "indexes", "task_index.json");
    const data = await this.readJson<{ items?: HotspotRadarTaskSummary[] }>(file, {});
    return Array.isArray(data.items) ? data.items : [];
  }

  async listCandidateSummaries(accountId: string): Promise<HotspotRadarCandidateSummary[]> {
    const file = join(await this.accountDir(accountId), "indexes", "candidate_index.json");
    const data = await this.readJson<{ items?: HotspotRadarCandidateSummary[] }>(file, {});
    return Array.isArray(data.items) ? data.items : [];
  }

  async listSavedSummaries(accountId: string): Promise<HotspotRadarSavedSummary[]> {
    const file = join(await this.accountDir(accountId), "indexes", "saved_index.json");
    const data = await this.readJson<{ items?: HotspotRadarSavedSummary[] }>(file, {});
    return Array.isArray(data.items) ? data.items : [];
  }


  async rebuildIndexes(accountId: string): Promise<{ taskCount: number; candidateCount: number; savedCount: number }> {
    const base = await this.accountDir(accountId);
    const taskItems: Array<Record<string, unknown>> = [];
    const candidateItems: Array<Record<string, unknown>> = [];
    const savedItems: Array<Record<string, unknown>> = [];
    await this.scanJsonByDate(join(base, "tasks"), (obj, rel) => {
      taskItems.push({ id: obj.id, filePath: rel, watcherId: obj.watcherId, taskType: obj.taskType, status: obj.status, rawFileCount: obj.rawFileCount || 0, standardizedCount: obj.standardizedCount || 0, dedupedCount: obj.dedupedCount || 0, savedCount: obj.savedCount || 0, createdAt: obj.createdAt || "" });
    });
    await this.scanJsonByDate(join(base, "candidates"), (obj, rel) => {
      candidateItems.push({ id: obj.id, filePath: rel, title: obj.title, summary: obj.summary, source: obj.source, matchedKeyword: obj.matchedKeyword, status: obj.status, roughDecision: obj.roughScreen?.decision || null, roughScore: obj.roughScreen?.roughScore || 0, finalDecision: obj.finalAnalyze?.decision || null, finalScore: obj.finalAnalyze?.score || 0, createdAt: obj.createdAt || "" });
    });
    await this.scanJsonByDate(join(base, "saved"), (obj, rel) => {
      savedItems.push({ id: obj.id, filePath: rel, recommendedTopic: obj.recommendedTopic, hotspotTitle: obj.hotspotTitle, hotspotSummary: obj.hotspotSummary, source: obj.source, url: obj.url, decision: obj.decision, score: obj.score || 0, status: obj.status, createdAt: obj.createdAt || "" });
    });
    const idx = join(base, "indexes");
    await mkdir(idx, { recursive: true });
    const now = new Date().toISOString();
    await this.writeJson(join(idx, "task_index.json"), { accountId, updatedAt: now, items: taskItems });
    await this.writeJson(join(idx, "candidate_index.json"), { accountId, updatedAt: now, items: candidateItems });
    await this.writeJson(join(idx, "saved_index.json"), { accountId, updatedAt: now, items: savedItems });
    return { taskCount: taskItems.length, candidateCount: candidateItems.length, savedCount: savedItems.length };
  }

  private async scanJsonByDate(root: string, onItem: (obj: Record<string, any>, relPath: string) => void): Promise<void> {
    let ds: Array<{ isDirectory: () => boolean; name: string }> = [];
    try { ds = (await readdir(root, { withFileTypes: true })) as any; } catch { return; }
    for (const d of ds) {
      if (!d.isDirectory()) continue;
      const dir = join(root, d.name);
      let fs: Array<{ isFile: () => boolean; name: string }> = [];
      try { fs = (await readdir(dir, { withFileTypes: true })) as any; } catch { continue; }
      for (const f of fs) {
        if (!f.isFile() || !f.name.endsWith('.json')) continue;
        const obj = await this.readJson<Record<string, any>>(join(dir, f.name), {});
        const rel = `${root.split('/').slice(-1)[0]}/${d.name}/${f.name}`;
        onItem(obj, rel);
      }
    }
  }

  async runManualTask(accountId: string, watcherId: string): Promise<HotspotManualRunResult> {
    const watcher = await this.getWatcher(accountId, watcherId);
    const accountProfile = await this.getAccountById(accountId);
    const globalConfig = await this.getGlobalConfig();
    const taskId = `task_${randomUUID().slice(0, 8)}`;
    const day = new Date().toISOString().slice(0, 10);
    const rawDir = join(await this.accountDir(accountId), "raw", day, taskId);
    await mkdir(rawDir, { recursive: true });

    let rawFileCount = 0;
    const rawFiles: string[] = [];
    const standardized: NormalizedItem[] = [];

    for (const sourceCfg of watcher.sources.filter((s) => s.enabled)) {
      for (const command of sourceCfg.enabledCommands) {
        if (!ALLOWED_COLLECTION_COMMANDS.has(command)) {
          continue;
        }
        const needsKeyword = command === "search";
        const keywords = needsKeyword ? watcher.keywords : [""];
        for (const keyword of keywords) {
          const args = this.buildOpenCliArgs(globalConfig.opencliProfile, sourceCfg.source, command, keyword, sourceCfg);
          const executedCommand = ["opencli", ...args].join(" ");
          let success = true;
          let errorMessage: string | null = null;
          let rawOutput: unknown = {};
          try {
            const result = await this.openCliRunner.run(args, { timeoutMs: 120000 });
            rawOutput = this.tryParseJson(result.stdout);
          } catch (error) {
            success = false;
            errorMessage = error instanceof Error ? error.message : String(error);
          }
          const time = new Date();
          const hhmmss = `${String(time.getHours()).padStart(2, "0")}${String(time.getMinutes()).padStart(2, "0")}${String(time.getSeconds()).padStart(2, "0")}`;
          const safeKeyword = keyword.replace(/\s+/g, "_").replace(/[^\w\u4e00-\u9fa5-]/g, "");
          const fileName = safeKeyword
            ? `${sourceCfg.source}_${command}_${safeKeyword}_${hhmmss}.json`
            : `${sourceCfg.source}_${command}_${hhmmss}.json`;
          const rawData: RawFilePayload = {
            taskId,
            accountId,
            watcherId,
            source: sourceCfg.source,
            command,
            keyword: keyword || null,
            executedCommand,
            collectedAt: time.toISOString(),
            success,
            errorMessage,
            rawOutput
          };
          await writeFile(join(rawDir, fileName), JSON.stringify(rawData, null, 2), "utf8");
          rawFiles.push(`raw/${day}/${taskId}/${fileName}`);
          rawFileCount += 1;

          if (success) {
            const llmItems = await this.standardizeRawOutputWithLlm(rawData, globalConfig);
            standardized.push(...(llmItems.length ? llmItems : this.standardizeRawOutput(rawData)));
          }
        }
      }
    }

    const dedupeResult = await this.dedupeItems(accountId, standardized, watcher.dedupeLookbackDays || globalConfig.dedupeLookbackDays || 15);
    const candidateFiles = await this.writeCandidates(accountId, watcher.id, taskId, day, dedupeResult.keptItems);
    const roughMap = await this.runRoughScreenBatch(accountId, accountProfile, watcher, candidateFiles, globalConfig);
    const screening = await this.runScreening(accountId, accountProfile, watcher, day, candidateFiles, globalConfig, roughMap);
    await this.updateCandidateIndex(accountId, candidateFiles);
    await this.updateSavedIndex(accountId, screening.savedFiles);

    await this.writeTaskFile(accountId, day, taskId, watcher, {
      rawFileCount,
      standardizedCount: standardized.length,
      dedupedCount: dedupeResult.keptItems.length,
      rawFiles,
      candidateFiles,
      duplicateDropped: dedupeResult.duplicateDropped,
      savedFiles: screening.savedFiles,
      roughKeepCount: screening.roughKeepCount,
      roughReviewCount: screening.roughReviewCount,
      savedCount: screening.savedCount,
      reviewCount: screening.reviewCount,
      discardCount: screening.discardCount,
      blockedCount: screening.blockedCount
    });
    await this.updateTaskIndex(accountId, day, taskId, watcher.id, rawFileCount, standardized.length, dedupeResult.keptItems.length, candidateFiles.length, screening.savedCount);

    return {
      taskId,
      rawFileCount,
      standardizedCount: standardized.length,
      dedupedCount: dedupeResult.keptItems.length,
      candidateCount: candidateFiles.length
    };
  }

  private standardizeRawOutput(raw: RawFilePayload): NormalizedItem[] {
    const list = this.extractList(raw.rawOutput);
    return list
      .map((item, index) => this.normalizeItem(item, raw, index))
      .filter((item) => item.title || item.summary || item.url);
  }

  private extractList(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    const obj = value as Record<string, unknown>;
    const candidates = [obj.items, obj.data, obj.list, obj.results, obj.posts, obj.articles, obj.news];
    for (const c of candidates) {
      if (Array.isArray(c)) return c;
    }
    return [];
  }

  private normalizeItem(value: unknown, raw: RawFilePayload, index: number): NormalizedItem {
    const obj = (value && typeof value === "object" ? (value as Record<string, unknown>) : {}) as Record<string, unknown>;
    const title = this.pickString(obj, ["title", "name", "headline", "subject"]);
    const summary = this.pickString(obj, ["summary", "desc", "description", "snippet", "content"]);
    const url = this.pickString(obj, ["url", "link", "href"]);
    return {
      title,
      summary,
      url,
      content: this.pickString(obj, ["content", "body", "text"]),
      author: this.pickString(obj, ["author", "username", "user", "publisher"]),
      publishTime: this.pickString(obj, ["publishTime", "publishedAt", "time", "date"]),
      heat: this.pickNumber(obj, ["heat", "hot", "score"]),
      likeCount: this.pickNumber(obj, ["likeCount", "likes"]),
      commentCount: this.pickNumber(obj, ["commentCount", "comments"]),
      shareCount: this.pickNumber(obj, ["shareCount", "shares"]),
      source: raw.source,
      sourceCommand: raw.command,
      matchedKeyword: raw.keyword || "",
      rawItemIndex: index
    };
  }

  private async dedupeItems(accountId: string, items: NormalizedItem[], lookbackDays: number): Promise<{ keptItems: NormalizedItem[]; duplicateDropped: unknown[] }> {
    const existing = await this.loadRecentDedupeSet(accountId, lookbackDays);
    const keptItems: NormalizedItem[] = [];
    const duplicateDropped: unknown[] = [];

    for (const item of items) {
      const normalizedUrl = this.normalizeUrl(item.url);
      const normalizedTitle = this.normalizeTitle(item.title);
      if (normalizedUrl && existing.urls.has(normalizedUrl)) {
        duplicateDropped.push({ title: item.title, url: item.url, source: item.source, dropReason: "duplicate_url", duplicateWith: "recent_candidates_or_saved" });
        continue;
      }
      if (item.title && existing.titles.has(item.title.trim())) {
        duplicateDropped.push({ title: item.title, url: item.url, source: item.source, dropReason: "duplicate_title", duplicateWith: "recent_candidates_or_saved" });
        continue;
      }
      if (normalizedTitle && existing.normalizedTitles.has(normalizedTitle)) {
        duplicateDropped.push({ title: item.title, url: item.url, source: item.source, dropReason: "duplicate_normalized_title", duplicateWith: "recent_candidates_or_saved" });
        continue;
      }
      if (normalizedUrl) existing.urls.add(normalizedUrl);
      if (item.title) existing.titles.add(item.title.trim());
      if (normalizedTitle) existing.normalizedTitles.add(normalizedTitle);
      keptItems.push(item);
    }
    return { keptItems, duplicateDropped };
  }

  private async writeCandidates(accountId: string, watcherId: string, taskId: string, day: string, items: NormalizedItem[]): Promise<string[]> {
    const dir = join(await this.accountDir(accountId), "candidates", day);
    await mkdir(dir, { recursive: true });
    const files: string[] = [];
    const now = new Date().toISOString();

    for (const item of items) {
      const id = `candidate_${randomUUID().slice(0, 8)}`;
      const fileName = `${id}.json`;
      const payload = {
        id,
        accountId,
        watcherId,
        taskId,
        title: item.title,
        summary: item.summary,
        url: item.url,
        content: item.content,
        source: item.source,
        sourceCommand: item.sourceCommand,
        matchedKeyword: item.matchedKeyword,
        author: item.author,
        publishTime: item.publishTime,
        heat: item.heat,
        likeCount: item.likeCount,
        commentCount: item.commentCount,
        shareCount: item.shareCount,
        status: "deduped",
        rawItemIndex: item.rawItemIndex,
        roughScreen: null,
        finalAnalyze: null,
        createdAt: now,
        updatedAt: now
      };
      await writeFile(join(dir, fileName), JSON.stringify(payload, null, 2), "utf8");
      files.push(`candidates/${day}/${fileName}`);
    }
    return files;
  }

  private async updateCandidateIndex(accountId: string, candidateFiles: string[]): Promise<void> {
    const indexDir = join(await this.accountDir(accountId), "indexes");
    await mkdir(indexDir, { recursive: true });
    const indexFile = join(indexDir, "candidate_index.json");
    const now = new Date().toISOString();
    const existing = await this.readJson<Record<string, unknown>>(indexFile, { accountId, updatedAt: now, items: [] });
    const items = Array.isArray(existing.items) ? [...existing.items] : [];

    for (const filePath of candidateFiles) {
      const payload = await this.readJson<Record<string, unknown>>(join(await this.accountDir(accountId), filePath), {});
      const rough = (payload.roughScreen || {}) as Record<string, unknown>;
      const final = (payload.finalAnalyze || {}) as Record<string, unknown>;
      items.push({
        id: payload.id,
        filePath,
        title: payload.title,
        summary: payload.summary,
        source: payload.source,
        matchedKeyword: payload.matchedKeyword,
        status: payload.status,
        roughDecision: rough.decision || null,
        roughScore: Number(rough.roughScore || 0),
        finalDecision: final.decision || null,
        finalScore: Number(final.score || 0),
        createdAt: payload.createdAt
      });
    }

    await this.writeJson(indexFile, { accountId, updatedAt: now, items });
  }

  private async updateTaskIndex(
    accountId: string,
    day: string,
    taskId: string,
    watcherId: string,
    rawFileCount: number,
    standardizedCount: number,
    dedupedCount: number,
    candidateCount: number,
    savedCount: number
  ): Promise<void> {
    const indexDir = join(await this.accountDir(accountId), "indexes");
    await mkdir(indexDir, { recursive: true });
    const indexFile = join(indexDir, "task_index.json");
    const now = new Date().toISOString();
    const existing = await this.readJson<Record<string, unknown>>(indexFile, { accountId, updatedAt: now, items: [] });
    const items = Array.isArray(existing.items) ? [...existing.items] : [];
    items.push({
      id: taskId,
      filePath: `tasks/${day}/${taskId}.json`,
      watcherId,
      taskType: "manual",
      status: "success",
      rawFileCount,
      standardizedCount,
      dedupedCount,
      savedCount,
      createdAt: now,
      candidateCount
    });
    await this.writeJson(indexFile, { accountId, updatedAt: now, items });
  }

  private async loadRecentDedupeSet(accountId: string, lookbackDays: number): Promise<{ urls: Set<string>; titles: Set<string>; normalizedTitles: Set<string> }> {
    const urls = new Set<string>();
    const titles = new Set<string>();
    const normalizedTitles = new Set<string>();
    const dates = this.recentDates(lookbackDays);

    for (const d of dates) {
      const cDir = join(await this.accountDir(accountId), "candidates", d);
      const sDir = join(await this.accountDir(accountId), "saved", d);
      await this.collectDedupeFromDir(cDir, urls, titles, normalizedTitles);
      await this.collectDedupeFromDir(sDir, urls, titles, normalizedTitles);
    }

    return { urls, titles, normalizedTitles };
  }

  private async collectDedupeFromDir(dir: string, urls: Set<string>, titles: Set<string>, normalizedTitles: Set<string>): Promise<void> {
    let entries: Array<{ isFile: () => boolean; name: string }> = [];
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as Array<{ isFile: () => boolean; name: string }>;
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".json")) continue;
      try {
        const obj = JSON.parse(await readFile(join(dir, e.name), "utf8")) as Record<string, unknown>;
        const title = String(obj.title || obj.hotspotTitle || "").trim();
        const url = String(obj.url || "").trim();
        const nUrl = this.normalizeUrl(url);
        const nTitle = this.normalizeTitle(title);
        if (nUrl) urls.add(nUrl);
        if (title) titles.add(title);
        if (nTitle) normalizedTitles.add(nTitle);
      } catch {}
    }
  }

  private async writeTaskFile(
    accountId: string,
    day: string,
    taskId: string,
    watcher: HotspotRadarWatcher,
    data: {
      rawFileCount: number;
      standardizedCount: number;
      dedupedCount: number;
      rawFiles: string[];
      candidateFiles: string[];
      duplicateDropped: unknown[];
      savedFiles: string[];
      roughKeepCount: number;
      roughReviewCount: number;
      savedCount: number;
      reviewCount: number;
      discardCount: number;
      blockedCount: number;
    }
  ): Promise<void> {
    const taskDir = join(await this.accountDir(accountId), "tasks", day);
    await mkdir(taskDir, { recursive: true });
    const now = new Date().toISOString();
    const task = {
      id: taskId,
      accountId,
      watcherId: watcher.id,
      taskType: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      sources: watcher.sources.filter((s) => s.enabled).map((s) => s.source),
      keywords: watcher.keywords,
      rawFileCount: data.rawFileCount,
      standardizedCount: data.standardizedCount,
      dedupedCount: data.dedupedCount,
      roughKeepCount: data.roughKeepCount,
      roughReviewCount: data.roughReviewCount,
      savedCount: data.savedCount,
      reviewCount: data.reviewCount,
      discardCount: data.discardCount,
      blockedCount: data.blockedCount,
      rawFiles: data.rawFiles,
      candidateFiles: data.candidateFiles,
      savedFiles: data.savedFiles,
      duplicateDropped: data.duplicateDropped,
      errorMessage: null,
      createdAt: now
    };
    await this.writeJson(join(taskDir, `${taskId}.json`), task);
  }




  private async askLlmJson(cfg: HotspotRadarGlobalConfig, prompt: string): Promise<string> {
    const modelHint = cfg.llm.model?.trim() ? `【模型要求:${cfg.llm.model?.trim()}】
` : "";
    return this.openCliWebLlmService.askByProvider({
      provider: cfg.llm.provider,
      profile: cfg.llm.profile,
      prompt: `${modelHint}${prompt}`,
      timeoutMs: cfg.llm.timeoutMs || 120000,
      intervalMs: cfg.llm.intervalMs || 3000
    });
  }

  private async standardizeRawOutputWithLlm(raw: RawFilePayload, cfg: HotspotRadarGlobalConfig): Promise<NormalizedItem[]> {
    if (!cfg.llm.profile) return [];
    const prompt = `你是OpenCLI热点采集结果标准化助手。只输出JSON。输入 source=${raw.source} command=${raw.command} keyword=${raw.keyword || ""} rawOutput=${JSON.stringify(raw.rawOutput).slice(0, 12000)}。输出格式:{"items":[{"source":"","sourceCommand":"","matchedKeyword":"","title":"","summary":"","url":"","content":"","author":"","publishTime":"","heat":0,"likeCount":0,"commentCount":0,"shareCount":0,"rawItemIndex":0}]}`;
    try {
      const text = await this.askLlmJson(cfg, prompt);
      const parsed = this.tryParseJson(text) as Record<string, unknown>;
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      return items.map((v, i) => {
        const obj = (v && typeof v === "object") ? (v as Record<string, unknown>) : {};
        return {
          title: String(obj.title || ""),
          summary: String(obj.summary || ""),
          url: String(obj.url || ""),
          content: String(obj.content || ""),
          author: String(obj.author || ""),
          publishTime: String(obj.publishTime || ""),
          heat: Number(obj.heat || 0),
          likeCount: Number(obj.likeCount || 0),
          commentCount: Number(obj.commentCount || 0),
          shareCount: Number(obj.shareCount || 0),
          source: String(obj.source || raw.source),
          sourceCommand: String(obj.sourceCommand || raw.command),
          matchedKeyword: String(obj.matchedKeyword || raw.keyword || ""),
          rawItemIndex: Number(obj.rawItemIndex ?? i)
        } as NormalizedItem;
      }).filter((x) => x.title || x.summary || x.url);
    } catch {
      return [];
    }
  }

  private async runRoughScreenBatch(
    accountId: string,
    accountProfile: HotspotRadarAccount | null,
    watcher: HotspotRadarWatcher,
    candidateFiles: string[],
    cfg: HotspotRadarGlobalConfig
  ): Promise<Record<string, { decision: RoughDecision; roughScore: number; reason: string; suggestedNextAction: "final_analyze" | "none" }>> {
    const map: Record<string, { decision: RoughDecision; roughScore: number; reason: string; suggestedNextAction: "final_analyze" | "none" }> = {};
    const rows: Array<Record<string, unknown>> = [];
    for (const filePath of candidateFiles) {
      const c = await this.readJson<Record<string, unknown>>(join(await this.accountDir(accountId), filePath), {});
      rows.push({ id: c.id, title: c.title, summary: c.summary, url: c.url, source: c.source, matchedKeyword: c.matchedKeyword, heat: c.heat, publishTime: c.publishTime });
    }
    if (cfg.llm.profile && rows.length) {
      const prompt = `你是热点雷达第一层粗筛助手。账号画像=${JSON.stringify(accountProfile || {}, null, 0)} 监听器=${watcher.name} 关键词=${watcher.keywords.join(",")} 热点列表=${JSON.stringify(rows).slice(0,18000)}。仅输出JSON:{"results":[{"id":"","decision":"candidate_keep|candidate_review|discard|blocked","roughScore":0,"reason":"","suggestedNextAction":"final_analyze|none"}]}`;
      try {
        const text = await this.askLlmJson(cfg, prompt);
        const parsed = this.tryParseJson(text) as Record<string, unknown>;
        const results = Array.isArray(parsed?.results) ? parsed.results : [];
        for (const r of results) {
          const obj = (r && typeof r === "object") ? (r as Record<string, unknown>) : {};
          const id = String(obj.id || "");
          const d = String(obj.decision || "discard") as RoughDecision;
          if (!id || !["candidate_keep","candidate_review","discard","blocked"].includes(d)) continue;
          map[id] = { decision: d, roughScore: Number(obj.roughScore || 0), reason: String(obj.reason || ""), suggestedNextAction: String(obj.suggestedNextAction || "none") === "final_analyze" ? "final_analyze" : "none" };
        }
      } catch {}
    }
    return map;
  }

  private async runScreening(
    accountId: string,
    accountProfile: HotspotRadarAccount | null,
    watcher: HotspotRadarWatcher,
    day: string,
    candidateFiles: string[],
    globalConfig: HotspotRadarGlobalConfig,
    roughMap: Record<string, { decision: RoughDecision; roughScore: number; reason: string; suggestedNextAction: "final_analyze" | "none" }>
  ): Promise<{
    savedFiles: string[];
    roughKeepCount: number;
    roughReviewCount: number;
    savedCount: number;
    reviewCount: number;
    discardCount: number;
    blockedCount: number;
  }> {
    let roughKeepCount = 0;
    let roughReviewCount = 0;
    let savedCount = 0;
    let reviewCount = 0;
    let discardCount = 0;
    let blockedCount = 0;
    const savedFiles: string[] = [];

    for (const filePath of candidateFiles) {
      const candidate = await this.readJson<Record<string, unknown>>(join(await this.accountDir(accountId), filePath), {});
      const rough = roughMap[String(candidate.id || "")] || this.roughScreenCandidate(candidate, watcher);
      if (rough.decision === "candidate_keep") roughKeepCount += 1;
      if (rough.decision === "candidate_review") roughReviewCount += 1;

      const final = await this.finalAnalyzeCandidate(candidate, accountProfile, watcher, globalConfig, rough.decision);
      candidate.roughScreen = rough;
      candidate.finalAnalyze = final;
      candidate.status = final.decision;
      candidate.updatedAt = new Date().toISOString();
      await writeFile(join(await this.accountDir(accountId), filePath), JSON.stringify(candidate, null, 2), "utf8");

      if (final.decision === "keep_high" || final.decision === "keep_normal") {
        const savedPath = await this.writeSavedHotspot(accountId, day, candidate, final);
        savedFiles.push(savedPath);
        savedCount += 1;
      } else if (final.decision === "review") reviewCount += 1;
      else if (final.decision === "discard") discardCount += 1;
      else blockedCount += 1;
    }
    return { savedFiles, roughKeepCount, roughReviewCount, savedCount, reviewCount, discardCount, blockedCount };
  }

  private roughScreenCandidate(candidate: Record<string, unknown>, watcher: HotspotRadarWatcher): { decision: RoughDecision; roughScore: number; reason: string; suggestedNextAction: "final_analyze" | "none" } {
    const text = `${candidate.title || ""} ${(candidate.summary || "")}`.toLowerCase();
    const hits = watcher.keywords.filter((k) => text.includes(String(k).toLowerCase())).length;
    const score = Math.min(95, 50 + hits * 10 + (candidate.url ? 10 : 0));
    if (!candidate.title && !candidate.summary && !candidate.url) return { decision: "discard", roughScore: 0, reason: "缺少基础信息", suggestedNextAction: "none" };
    if (score >= 70) return { decision: "candidate_keep", roughScore: score, reason: "与关键词和方向相关", suggestedNextAction: "final_analyze" };
    if (score >= 45) return { decision: "candidate_review", roughScore: score, reason: "可能相关但信息有限", suggestedNextAction: "final_analyze" };
    return { decision: "discard", roughScore: score, reason: "相关性低", suggestedNextAction: "none" };
  }

  private async finalAnalyzeCandidate(candidate: Record<string, unknown>, accountProfile: HotspotRadarAccount | null, watcher: HotspotRadarWatcher, cfg: HotspotRadarGlobalConfig, roughDecision: RoughDecision): Promise<Record<string, unknown>> {
    const title = String(candidate.title || "");
    const summary = String(candidate.summary || "");
    const hasMaterial = Boolean(String(candidate.url || "").trim() || summary.trim() || String(candidate.content || "").trim());
    let decision = roughDecision === "discard" ? "discard" : "review";
    let score = roughDecision === "candidate_keep" ? 78 : 58;
    if (hasMaterial && roughDecision === "candidate_keep") decision = "keep_normal";
    if (hasMaterial && score >= 85) decision = "keep_high";

    if (cfg.llm.profile) {
      try {
        const prompt = `你是热点雷达最终筛选助手。仅返回JSON。账号画像=${JSON.stringify(accountProfile || {}, null, 0)} 监听器=${watcher.name} 标题:${title} 摘要:${summary} URL:${candidate.url || ""} 请输出decision(keep_high|keep_normal|review|discard|blocked),score,recommendedTopic,hotspotSummary,reason,scores,nextDestinations`;
        const response = await this.askLlmJson(cfg, prompt);
        const json = this.tryParseJson(response) as Record<string, unknown>;
        if (json && typeof json === "object") {
          const parsedDecision = String(json.decision || "") as FinalDecision;
          if (FINAL_DECISION_SET.has(parsedDecision)) {
            json.decision = parsedDecision;
            return json;
          }
        }
      } catch {}
    }

    return {
      decision,
      score,
      recommendedTopic: title ? `${title} 对账号读者的影响与机会` : "待确认话题",
      hotspotSummary: summary || title,
      reason: ["基于关键词匹配和素材完整度的规则筛选"],
      scores: { accountRelevance: score, audienceInterest: score - 5, topicPotential: score - 8, materialQuality: hasMaterial ? 70 : 35, freshness: 70, risk: 20 },
      nextDestinations: decision === "discard" ? [] : ["topic_to_article", "material_rewrite"]
    };
  }

  private async writeSavedHotspot(accountId: string, day: string, candidate: Record<string, unknown>, final: Record<string, unknown>): Promise<string> {
    const dir = join(await this.accountDir(accountId), "saved", day);
    await mkdir(dir, { recursive: true });
    const id = `hotspot_${randomUUID().slice(0, 8)}`;
    const fileName = `${id}.json`;
    const now = new Date().toISOString();
    const payload = {
      id,
      accountId,
      watcherId: candidate.watcherId,
      taskId: candidate.taskId,
      candidateId: candidate.id,
      recommendedTopic: final.recommendedTopic || "",
      hotspotTitle: candidate.title || "",
      hotspotSummary: final.hotspotSummary || candidate.summary || "",
      source: candidate.source || "",
      url: candidate.url || "",
      content: candidate.content || "",
      decision: final.decision || "keep_normal",
      score: final.score || 0,
      reason: final.reason || [],
      scores: final.scores || {},
      nextDestinations: final.nextDestinations || [],
      status: "new",
      sourceCandidateFile: `candidates/${day}/${candidate.id}.json`,
      createdAt: now,
      updatedAt: now
    };
    await writeFile(join(dir, fileName), JSON.stringify(payload, null, 2), "utf8");
    return `saved/${day}/${fileName}`;
  }

  private async updateSavedIndex(accountId: string, savedFiles: string[]): Promise<void> {
    const indexDir = join(await this.accountDir(accountId), "indexes");
    await mkdir(indexDir, { recursive: true });
    const indexFile = join(indexDir, "saved_index.json");
    const now = new Date().toISOString();
    const existing = await this.readJson<Record<string, unknown>>(indexFile, { accountId, updatedAt: now, items: [] });
    const items = Array.isArray(existing.items) ? [...existing.items] : [];
    for (const filePath of savedFiles) {
      const payload = await this.readJson<Record<string, unknown>>(join(await this.accountDir(accountId), filePath), {});
      items.push({ id: payload.id, filePath, recommendedTopic: payload.recommendedTopic, hotspotTitle: payload.hotspotTitle, hotspotSummary: payload.hotspotSummary, source: payload.source, url: payload.url, decision: payload.decision, score: payload.score, status: payload.status, createdAt: payload.createdAt });
    }
    await this.writeJson(indexFile, { accountId, updatedAt: now, items });
  }

  async runScheduledTasks(): Promise<Array<{ accountId: string; watcherId: string; taskId: string }>> {
    const accounts = await this.listAccounts();
    const out: Array<{ accountId: string; watcherId: string; taskId: string }> = [];
    for (const account of accounts.filter((a) => a.enabled)) {
      const watchersDir = join(await this.accountDir(account.id), "watchers");
      let entries: Array<{ isFile: () => boolean; name: string }> = [];
      try { entries = (await readdir(watchersDir, { withFileTypes: true })) as Array<{ isFile: () => boolean; name: string }>; } catch { continue; }
      for (const e of entries) {
        if (!e.isFile() || !String(e.name).endsWith('.json')) continue;
        const watcher = await this.readJson<HotspotRadarWatcher>(join(watchersDir, String(e.name)), null as unknown as HotspotRadarWatcher);
        if (!watcher?.enabled) continue;
        const last = watcher.lastRunAt ? new Date(watcher.lastRunAt).getTime() : 0;
        const intervalMs = Math.max(1, watcher.runIntervalMinutes || 60) * 60 * 1000;
        if (Date.now() - last < intervalMs) continue;
        const lockPath = join(await this.accountDir(account.id), '.lock');
        const lock = await this.readJson<{ active?: boolean }>(lockPath, {});
        if (lock.active) continue;
        await writeFile(lockPath, JSON.stringify({ active: true, at: new Date().toISOString() }), 'utf8');
        try {
          const result = await this.runManualTask(account.id, watcher.id);
          watcher.lastRunAt = new Date().toISOString();
          watcher.updatedAt = new Date().toISOString();
          await writeFile(join(watchersDir, String(e.name)), JSON.stringify(watcher, null, 2), 'utf8');
          out.push({ accountId: account.id, watcherId: watcher.id, taskId: result.taskId });
        } finally {
          await writeFile(lockPath, JSON.stringify({ active: false, at: new Date().toISOString() }), 'utf8');
        }
      }
    }
    return out;
  }

  async cleanupOldData(days?: number): Promise<{ deletedRawDirs: number; deletedTaskDirs: number; deletedCandidateFiles: number }> {
    const cfg = await this.getGlobalConfig();
    const ttl = days && days > 0 ? days : cfg.dedupeLookbackDays || 15;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ttl);
    const accounts = await this.listAccounts();
    let deletedRawDirs = 0, deletedTaskDirs = 0, deletedCandidateFiles = 0;
    for (const account of accounts) {
      for (const base of ['raw','tasks','candidates']) {
        const dir = join(await this.accountDir(account.id), base);
        let entries=[] as Array<{isDirectory:()=>boolean;name:string}>;
        try{entries=(await readdir(dir,{withFileTypes:true})) as Array<{isDirectory:()=>boolean;name:string}>;}catch{continue;}
        for (const e of entries){
          if(!e.isDirectory()) continue;
          const dt = new Date(String(e.name));
          if(Number.isNaN(dt.getTime())||dt>=cutoff) continue;
          if (base === "candidates") {
            const candidateDir = join(dir, String(e.name));
            const canDelete = await this.canDeleteCandidateDateDir(account.id, candidateDir);
            if (!canDelete) {
              continue;
            }
          }
          await rm(join(dir, String(e.name)), { recursive: true, force: true });
          if(base==='raw') deletedRawDirs+=1; else if(base==='tasks') deletedTaskDirs+=1; else deletedCandidateFiles+=1;
        }
      }
    }
    return { deletedRawDirs, deletedTaskDirs, deletedCandidateFiles };
  }


  private async canDeleteCandidateDateDir(accountId: string, candidateDir: string): Promise<boolean> {
    const savedIndexFile = join(await this.accountDir(accountId), "indexes", "saved_index.json");
    const savedIndex = await this.readJson<{ items?: Array<{ sourceCandidateFile?: string }> }>(savedIndexFile, {});
    const linked = new Set((savedIndex.items || []).map((x) => String(x.sourceCandidateFile || "")).filter(Boolean));
    let entries: Array<{ isFile: () => boolean; name: string }> = [];
    try {
      entries = (await readdir(candidateDir, { withFileTypes: true })) as Array<{ isFile: () => boolean; name: string }>;
    } catch {
      return true;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const full = join(candidateDir, entry.name);
      const item = await this.readJson<{ id?: string }>(full, {});
      const date = candidateDir.split('/').slice(-1)[0];
      const rel = `candidates/${date}/${item.id || entry.name.replace('.json','')}.json`;
      if (linked.has(rel)) return false;
    }
    return true;
  }

  private buildOpenCliArgs(profile: string, source: string, command: string, keyword: string, sourceCfg: HotspotRadarSourceConfig): string[] {
    const args = ["--profile", profile || "default", source, command];
    if (keyword) args.push(keyword);
    const limit = command === "search" ? sourceCfg.searchLimit : sourceCfg.topLimit;
    if (limit && limit > 0) args.push("--limit", String(limit));
    args.push("-f", "json");
    return args;
  }

  private async getWatcher(accountId: string, watcherId: string): Promise<HotspotRadarWatcher> {
    const file = join(await this.accountDir(accountId), "watchers", `${watcherId}.json`);
    return JSON.parse(await readFile(file, "utf8")) as HotspotRadarWatcher;
  }

  private pickString(obj: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  }

  private pickNumber(obj: Record<string, unknown>, keys: string[]): number {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
    }
    return 0;
  }

  private normalizeUrl(url: string): string {
    if (!url) return "";
    try {
      const u = new URL(url.trim());
      const params = [...u.searchParams.keys()];
      for (const key of params) {
        if (key.toLowerCase().startsWith("utm_") || key.toLowerCase().includes("track")) {
          u.searchParams.delete(key);
        }
      }
      u.hash = "";
      return `${u.origin}${u.pathname.replace(/\/$/, "")}${u.search ? `?${u.searchParams.toString()}` : ""}`;
    } catch {
      return url.trim();
    }
  }

  private normalizeTitle(title: string): string {
    return title
      .replace(/#[^#]+#/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  private recentDates(days: number): string[] {
    const result: string[] = [];
    const now = new Date();
    for (let i = 0; i < days; i += 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      result.push(d.toISOString().slice(0, 10));
    }
    return result;
  }

  private tryParseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }


  private async writeJson(file: string, value: unknown): Promise<void> {
    await writeFile(file, JSON.stringify(value, null, 2), "utf8");
  }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  async testLlmConfig(): Promise<{ ready: boolean; message: string }> {
    const cfg = await this.getGlobalConfig();
    if (!cfg.llm.profile) {
      return { ready: false, message: "未配置 LLM Profile" };
    }
    const result = await this.openCliWebLlmService.testProvider(cfg.llm.provider, cfg.llm.profile, cfg.llm.timeoutMs || 120000, cfg.llm.intervalMs || 3000);
    return { ready: result.ready, message: result.message };
  }

  private async dataRoot(): Promise<string> {
    const workspaceDir = (await this.settingsService.getSettings()).workspaceDir;
    return join(workspaceDir, "data", "hotspot-radar");
  }
  private async accountsDir(): Promise<string> {
    return join(await this.dataRoot(), "accounts");
  }
  private async accountDir(accountId: string): Promise<string> {
    return join(await this.accountsDir(), accountId);
  }
}
