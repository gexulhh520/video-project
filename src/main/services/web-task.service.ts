import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type {
  BrowserRuntimeHealthStatus,
  ConfirmWebRecordBodyOptions,
  IterativeRewriteWebTaskOptions,
  RewriteWebTaskOptions,
  SaveWebRewriteResultOptions,
  WebCrawlRecord,
  WebCrawlStartOptions,
  WebCrawlTask,
  WebImageAsset,
  WebTaskAutoExportResult,
  WebTaskProgress,
  WebTaskSummary
} from "../types/app.types";
import { BbBrowserService } from "./bb-browser.service";
import { BrowserRuntimeService } from "./browser-runtime.service";
import { LlmService } from "./llm.service";
import { SettingsService } from "./settings.service";

export class WebTaskService {
  private static readonly MAX_REWRITE_TITLE_LENGTH = 40;
  constructor(
    private readonly settingsService: SettingsService,
    private readonly llmService: LlmService,
    private readonly browserRuntimeService: BrowserRuntimeService,
    private readonly bbBrowserService: BbBrowserService
  ) {}

  async createTask(title?: string): Promise<WebCrawlTask> {
    const now = new Date().toISOString();
    const task: WebCrawlTask = {
      taskId: uuidv4(),
      title: title?.trim() || "未命名网页原创任务",
      createdAt: now,
      updatedAt: now,
      status: "idle",
      records: [],
      imageAssets: [],
      rewritePrompt: "",
      rewriteHistory: []
    };

    await this.saveTask(task);
    return task;
  }

  async listTasks(): Promise<WebTaskSummary[]> {
    const tasksDir = await this.getTasksDir();
    await mkdir(tasksDir, { recursive: true });
    const entries = await readdir(tasksDir, { withFileTypes: true });
    const tasks = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const task = await this.getTaskById(entry.name);
          return {
            taskId: task.taskId,
            title: task.title,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            recordCount: task.records.length,
            status: task.status
          } satisfies WebTaskSummary;
        })
    );

    return tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getTaskById(taskId: string): Promise<WebCrawlTask> {
    const taskPath = await this.getTaskJsonPath(taskId);
    const content = await readFile(taskPath, "utf8");
    const task = JSON.parse(content) as WebCrawlTask;
    task.rewriteHistory = (task.rewriteHistory || []).map((item) => ({
      ...item,
      rewriteId: item.rewriteId || uuidv4()
    }));
    return task;
  }

  async startCrawl(
    taskId: string,
    options: WebCrawlStartOptions,
    onProgress?: (progress: WebTaskProgress) => void
  ): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    const record = this.prepareRecord(task, options);
    task.currentRecordId = record.recordId;
    task.status = "checking_runtime_health";
    await this.saveTask(task);

    try {
      this.emitProgress(task, record.recordId, "checking_runtime_health", 5, "正在检查 bb-browser 运行环境", onProgress);
      const runtimeHealth = await this.browserRuntimeService.checkHealth();
      if (!runtimeHealth.healthy) {
        task.runtimeHealth = runtimeHealth;
        task.status = "resetting_runtime";
        await this.saveTask(task);
        this.emitProgress(task, record.recordId, "resetting_runtime", 12, "运行环境异常，正在自动重置", onProgress);
      }

      const ensuredHealth = await this.browserRuntimeService.ensureHealthy();
      task.runtimeHealth = ensuredHealth;
      await this.saveTask(task);

      this.emitProgress(task, record.recordId, "opening_page", 20, "正在打开页面", onProgress);
      record.status = "opening_page";
      const openResult = await this.bbBrowserService.open(record.sourceUrl);
      record.tabId = openResult.tabId;
      record.lastRunAt = new Date().toISOString();

      this.emitProgress(task, record.recordId, "waiting_page_ready", 32, "正在等待页面加载", onProgress);
      record.status = "waiting_page_ready";
      await this.waitForPageReady(record.tabId);

      this.emitProgress(task, record.recordId, "fetching_title", 46, "正在读取标题", onProgress);
      record.status = "fetching_title";
      record.title = await this.bbBrowserService.getTitle(record.tabId);

      this.emitProgress(task, record.recordId, "capturing_snapshot", 60, "正在获取网页快照", onProgress);
      record.status = "capturing_snapshot";
      record.snapshot = await this.bbBrowserService.snapshot(record.tabId);

      this.emitProgress(task, record.recordId, "extracting_article", 80, "正在提取正文", onProgress);
      record.status = "extracting_article";
      record.extractedBody = await this.llmService.extractArticleFromSnapshot(record.title, record.snapshot, record.extractPrompt);
      record.userEditedBody = record.extractedBody;
      record.status = "awaiting_user_confirmation";
      task.status = "awaiting_user_confirmation";
      task.updatedAt = new Date().toISOString();
      await this.saveTask(task);
      this.emitProgress(task, record.recordId, "awaiting_user_confirmation", 100, "正文已提取，请确认或修改", onProgress);
      return task;
    } catch (error) {
      record.status = "failed";
      record.failureReason = error instanceof Error ? error.message : "抓取失败";
      task.status = "failed";
      task.updatedAt = new Date().toISOString();
      await this.saveTask(task);
      this.emitProgress(task, record.recordId, "failed", 100, record.failureReason, onProgress);
      return task;
    }
  }

  async saveRecordBody(taskId: string, options: ConfirmWebRecordBodyOptions): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    const record = this.getRecord(task, options.recordId);
    record.userEditedBody = options.body.trim();
    record.status = "ready_for_next_url";
    task.status = "ready_for_next_url";
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    return task;
  }

  async retryRecordExtract(taskId: string, options: { recordId: string; prompt: string }): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    const record = this.getRecord(task, options.recordId);
    record.extractPrompt = options.prompt.trim();
    record.extractedBody = await this.llmService.extractArticleFromSnapshot(record.title, record.snapshot, record.extractPrompt);
    record.userEditedBody = record.extractedBody;
    record.status = "awaiting_user_confirmation";
    task.status = "awaiting_user_confirmation";
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    return task;
  }

  async collectRecordImages(
    taskId: string,
    recordId: string,
    onProgress?: (progress: WebTaskProgress) => void
  ): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    const record = this.getRecord(task, recordId);
    if (!record.tabId) {
      throw new Error("当前记录缺少 tabId，无法抓取图片。");
    }

    task.status = "checking_runtime_health";
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    this.emitProgress(task, record.recordId, "checking_runtime_health", 10, "抓图前检查浏览器环境", onProgress);
    const healthBeforeCollect = await this.browserRuntimeService.checkHealth();
    const runtimeRecoveredBeforeCollect = !healthBeforeCollect.healthy;
    task.runtimeHealth = runtimeRecoveredBeforeCollect
      ? await this.browserRuntimeService.ensureHealthy()
      : healthBeforeCollect;
    await this.saveTask(task);

    if (runtimeRecoveredBeforeCollect) {
      this.emitProgress(task, record.recordId, "opening_page", 18, "浏览器已恢复，重新打开页面以继续抓图", onProgress);
      await this.reopenRecordPage(record);
      task.currentRecordId = record.recordId;
      await this.saveTask(task);
    }

    record.status = "collecting_images";
    task.status = "collecting_images";
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    this.emitProgress(task, record.recordId, "collecting_images", 25, "正在收集网页图片", onProgress);

    let urls: string[];
    try {
      urls = await this.bbBrowserService.collectImageUrls(record.tabId);
    } catch (error) {
      if (this.isTabNotFoundError(error)) {
        this.emitProgress(task, record.recordId, "opening_page", 48, "页面标签已关闭，正在重新打开页面后继续抓图", onProgress);
        await this.reopenRecordPage(record);
        task.currentRecordId = record.recordId;
        await this.saveTask(task);
        this.emitProgress(task, record.recordId, "collecting_images", 55, "页面已重新打开，正在重试抓图", onProgress);
        urls = await this.bbBrowserService.collectImageUrls(record.tabId);
      } else if (!this.isRuntimeDisconnectedError(error)) {
        throw error;
      } else {
        task.status = "resetting_runtime";
        task.updatedAt = new Date().toISOString();
        await this.saveTask(task);
        this.emitProgress(task, record.recordId, "resetting_runtime", 40, "浏览器连接中断，正在自动恢复", onProgress);
        task.runtimeHealth = await this.browserRuntimeService.ensureHealthy();
        await this.saveTask(task);

        this.emitProgress(task, record.recordId, "opening_page", 48, "浏览器已恢复，重新打开页面后继续抓图", onProgress);
        await this.reopenRecordPage(record);
        task.currentRecordId = record.recordId;
        await this.saveTask(task);

        task.status = "collecting_images";
        task.updatedAt = new Date().toISOString();
        await this.saveTask(task);
        this.emitProgress(task, record.recordId, "collecting_images", 55, "浏览器已恢复，正在重试抓图", onProgress);
        urls = await this.bbBrowserService.collectImageUrls(record.tabId);
      }
    }

    const downloads = await this.bbBrowserService.downloadImages(urls, await this.getTaskImagesDir(taskId), record.sourceUrl);
    const assets: WebImageAsset[] = downloads.map((download) => ({
      assetId: uuidv4(),
      sourceUrl: download.sourceUrl,
      localPath: download.localPath,
      originRecordId: record.recordId,
      selected: Boolean(download.localPath),
      downloadedAt: download.localPath ? new Date().toISOString() : undefined,
      failedReason: download.failedReason
    }));

    task.imageAssets = [...task.imageAssets.filter((item) => item.originRecordId !== record.recordId), ...assets];
    record.imageAssetIds = assets.map((asset) => asset.assetId);
    this.emitProgress(task, record.recordId, "closing_tab", 80, "正在关闭页面标签", onProgress);
    await this.bbBrowserService.close(record.tabId);
    record.status = "ready_for_next_url";
    task.status = "ready_for_next_url";
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    this.emitProgress(task, record.recordId, "ready_for_next_url", 100, "图片已入库，可继续抓取下一个链接", onProgress);
    return task;
  }

  async toggleImageSelection(taskId: string, assetId: string, selected: boolean): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    const asset = task.imageAssets.find((item) => item.assetId === assetId);
    if (!asset) {
      throw new Error("未找到对应图片素材。");
    }

    asset.selected = selected;
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    return task;
  }

  async deleteRecord(taskId: string, recordId: string): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    const recordIndex = task.records.findIndex((item) => item.recordId === recordId);
    if (recordIndex === -1) {
      throw new Error("未找到对应的抓取记录。");
    }

    const record = task.records[recordIndex];
    task.records.splice(recordIndex, 1);

    task.imageAssets = task.imageAssets.filter((item) => item.originRecordId !== recordId);

    if (task.currentRecordId === recordId) {
      task.currentRecordId = undefined;
    }

    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    return task;
  }

  async rewriteTask(
    taskId: string,
    options: RewriteWebTaskOptions,
    onProgress?: (progress: WebTaskProgress) => void
  ): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    const requestedRecordIds = Array.from(new Set(options.recordIds.map((item) => item.trim()).filter(Boolean)));
    const confirmedRecords = task.records.filter(
      (record) => requestedRecordIds.includes(record.recordId) && record.userEditedBody.trim()
    );
    if (confirmedRecords.length === 0) {
      throw new Error("请至少确认并勾选一条正文后再开始二次原创。");
    }

    task.status = "rewriting";
    task.rewritePrompt = options.prompt.trim();
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    this.emitProgress(task, undefined, "rewriting", 25, "正在生成二次原创内容", onProgress);

    const rewriteResult = await this.llmService.rewriteWebContent(
      task.title,
      confirmedRecords.map((record) => ({
        title: record.title,
        body: record.userEditedBody
      })),
      task.rewritePrompt,
      confirmedRecords.map((record) => record.recordId)
    );

    rewriteResult.title = this.limitRewriteTitle(rewriteResult.title);
    rewriteResult.updatedAt = new Date().toISOString();

    task.rewriteResult = this.withRewriteId(rewriteResult);
    this.appendRewriteHistory(task, task.rewriteResult);
    task.status = "completed";
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    this.emitProgress(task, undefined, "completed", 100, "原创内容已生成完成", onProgress);
    return task;
  }

  async rewriteTaskIterative(
    taskId: string,
    options: IterativeRewriteWebTaskOptions,
    onProgress?: (progress: WebTaskProgress) => void
  ): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    const existingResult = task.rewriteResult;
    if (!existingResult || !existingResult.fullText.trim()) {
      throw new Error("当前任务还没有可迭代洗稿的结果，请先完成一次二次原创。");
    }

    task.status = "rewriting";
    task.rewritePrompt = options.prompt.trim();
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    this.emitProgress(task, undefined, "rewriting", 25, "正在基于当前结果进行迭代洗稿", onProgress);

    const rewriteResult = await this.llmService.rewriteWebContent(
      task.title,
      [
        {
          title: existingResult.title,
          body: existingResult.fullText
        }
      ],
      task.rewritePrompt,
      existingResult.sourceRecordIds
    );

    rewriteResult.title = this.limitRewriteTitle(rewriteResult.title);
    rewriteResult.updatedAt = new Date().toISOString();
    task.rewriteResult = this.withRewriteId(rewriteResult);
    this.appendRewriteHistory(task, task.rewriteResult);
    task.status = "completed";
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    this.emitProgress(task, undefined, "completed", 100, "迭代洗稿完成", onProgress);
    return task;
  }

  async saveRewriteResult(taskId: string, options: SaveWebRewriteResultOptions): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    const paragraphs = options.rewriteResult.paragraphs.map((item) => item.trim()).filter(Boolean);
    if (!options.rewriteResult.title.trim() || paragraphs.length === 0) {
      throw new Error("当前原创结果不完整，无法保存。");
    }

    task.rewriteResult = this.withRewriteId({
      ...options.rewriteResult,
      title: this.limitRewriteTitle(options.rewriteResult.title),
      paragraphs,
      fullText: paragraphs.join("\n\n"),
      updatedAt: new Date().toISOString(),
      sourceRecordIds: Array.from(new Set(options.rewriteResult.sourceRecordIds.map((item) => item.trim()).filter(Boolean)))
    });
    this.appendRewriteHistory(task, task.rewriteResult);
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    return task;
  }

  async deleteRewriteHistory(taskId: string, rewriteId: string): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    task.rewriteHistory = (task.rewriteHistory || []).filter((item) => item.rewriteId !== rewriteId);
    if (task.rewriteResult?.rewriteId === rewriteId) {
      task.rewriteResult = task.rewriteHistory[0];
    }
    task.updatedAt = new Date().toISOString();
    await this.saveTask(task);
    return task;
  }

  async exportTaskToWord(taskId: string, outputPath: string): Promise<string> {
    const task = await this.getTaskById(taskId);
    if (!task.rewriteResult) {
      throw new Error("当前任务还没有可导出的原创结果。");
    }

    const workspaceDir = await this.getWorkspaceDir();
    const exportTempDir = join(workspaceDir, "exports", "web-tmp", task.taskId);
    const tempDraftJsonPath = join(exportTempDir, `web-draft-${Date.now()}.json`);
    await mkdir(exportTempDir, { recursive: true });

    const exportPayload = {
      draftId: task.taskId,
      title: task.rewriteResult.title,
      fullText: task.rewriteResult.fullText,
      sections: task.rewriteResult.paragraphs.map((paragraph, index) => ({
        sectionId: `web_s_${index + 1}`,
        paragraph,
        sourceTimeRanges: []
      })),
      contentBlocks: task.rewriteResult.contentBlocks,
      createdAt: task.rewriteResult.createdAt,
      updatedAt: task.rewriteResult.updatedAt
    };

    await writeFile(tempDraftJsonPath, JSON.stringify(exportPayload, null, 2), "utf8");

    try {
      await this.runWordExportScript(tempDraftJsonPath, outputPath);
      return outputPath;
    } finally {
      await rm(exportTempDir, { recursive: true, force: true });
    }
  }

  async exportTaskImagesToDirectory(taskId: string, outputDir: string): Promise<string> {
    const task = await this.getTaskById(taskId);
    await mkdir(outputDir, { recursive: true });
    const sourceRecordIdSet = new Set(task.rewriteResult?.sourceRecordIds ?? []);
    const imageAssets = task.imageAssets.filter(
      (asset) =>
        Boolean(asset.localPath) &&
        asset.selected &&
        (sourceRecordIdSet.size === 0 || sourceRecordIdSet.has(asset.originRecordId))
    );

    if (imageAssets.length === 0) {
      throw new Error("当前图片池没有可导出的图片。");
    }

    for (const [index, asset] of imageAssets.entries()) {
      const extension = extname(asset.localPath || "") || ".jpg";
      const exportName = `${String(index + 1).padStart(2, "0")}_${this.sanitizeFileName(asset.originRecordId)}${extension}`;
      await copyFile(asset.localPath as string, join(outputDir, exportName));
    }

    return outputDir;
  }

  async autoExportTaskBundle(taskId: string): Promise<WebTaskAutoExportResult> {
    const task = await this.getTaskById(taskId);
    const workspaceDir = await this.getWorkspaceDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const bundleDir = join(
      workspaceDir,
      "exports",
      "web-auto",
      `${timestamp}_${this.sanitizeFileName(task.rewriteResult?.title || task.title || task.taskId)}`
    );
    await mkdir(bundleDir, { recursive: true });

    const wordPath = join(bundleDir, "result.docx");
    const imagesDirPath = join(bundleDir, "images");
    await this.exportTaskToWord(taskId, wordPath);
    await this.exportTaskImagesToDirectory(taskId, imagesDirPath);

    return {
      outputDir: bundleDir,
      wordPath,
      imagesDirPath
    };
  }

  private prepareRecord(task: WebCrawlTask, options: WebCrawlStartOptions): WebCrawlRecord {
    const existing = options.recordId ? task.records.find((item) => item.recordId === options.recordId) : undefined;
    if (existing) {
      existing.title = "";
      existing.snapshot = "";
      existing.extractedBody = "";
      existing.userEditedBody = "";
      existing.failureReason = undefined;
      existing.imageAssetIds = [];
      existing.rerunCount += 1;
      return existing;
    }

    const record: WebCrawlRecord = {
      recordId: uuidv4(),
      sourceUrl: options.url.trim(),
      title: "",
      snapshot: "",
      extractedBody: "",
      userEditedBody: "",
      extractPrompt: "",
      status: "idle",
      rerunCount: 0,
      imageAssetIds: []
    };
    task.records.unshift(record);
    return record;
  }

  private getRecord(task: WebCrawlTask, recordId: string): WebCrawlRecord {
    const record = task.records.find((item) => item.recordId === recordId);
    if (!record) {
      throw new Error("未找到对应的抓取记录。");
    }

    return record;
  }

  private async waitForPageReady(tabId: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const title = await this.bbBrowserService.getTitle(tabId);
      const snapshot = await this.bbBrowserService.snapshot(tabId);
      if (title.trim() && snapshot.trim().length > 200) {
        return;
      }

      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    }
  }

  private async reopenRecordPage(record: WebCrawlRecord): Promise<void> {
    if (record.tabId) {
      await this.bbBrowserService.close(record.tabId).catch(() => undefined);
    }

    const openResult = await this.bbBrowserService.open(record.sourceUrl);
    record.tabId = openResult.tabId;
    record.lastRunAt = new Date().toISOString();
    await this.waitForPageReady(record.tabId);
  }

  private emitProgress(
    task: WebCrawlTask,
    recordId: string | undefined,
    status: WebTaskProgress["status"],
    progress: number,
    message: string,
    onProgress?: (progress: WebTaskProgress) => void
  ): void {
    onProgress?.({
      taskId: task.taskId,
      recordId,
      status,
      progress,
      message
    });
  }

  private isRuntimeDisconnectedError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return /Chrome not connected|CDP WebSocket closed|Daemon HTTP 503|ECONNREFUSED/i.test(error.message);
  }

  private isTabNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return /Tab not found/i.test(error.message);
  }

  private async saveTask(task: WebCrawlTask): Promise<void> {
    const taskDir = await this.getTaskDir(task.taskId);
    await mkdir(taskDir, { recursive: true });
    task.updatedAt = new Date().toISOString();
    await writeFile(join(taskDir, "task.json"), JSON.stringify(task, null, 2), "utf8");
  }

  private withRewriteId(
    result: NonNullable<WebCrawlTask["rewriteResult"]>
  ): NonNullable<WebCrawlTask["rewriteResult"]> {
    return {
      ...result,
      rewriteId: result.rewriteId || uuidv4()
    };
  }

  private appendRewriteHistory(task: WebCrawlTask, result: NonNullable<WebCrawlTask["rewriteResult"]>): void {
    const next = {
      ...result,
      rewriteId: result.rewriteId || uuidv4()
    };
    const existing = (task.rewriteHistory || []).filter((item) => item.rewriteId !== next.rewriteId);
    task.rewriteHistory = [next, ...existing];
  }

  private limitRewriteTitle(title: string): string {
    const normalized = String(title || "").trim();
    if (!normalized) {
      return "";
    }
    return normalized.length > WebTaskService.MAX_REWRITE_TITLE_LENGTH
      ? normalized.slice(0, WebTaskService.MAX_REWRITE_TITLE_LENGTH)
      : normalized;
  }

  async deleteTask(taskId: string): Promise<void> {
    const taskDir = await this.getTaskDir(taskId);
    await rm(taskDir, { recursive: true, force: true });
  }

  async renameTask(taskId: string, title: string): Promise<WebCrawlTask> {
    const task = await this.getTaskById(taskId);
    task.title = title.trim() || task.title;
    await this.saveTask(task);
    return task;
  }

  private async getWorkspaceDir(): Promise<string> {
    return (await this.settingsService.getSettings()).workspaceDir;
  }

  private async getTasksDir(): Promise<string> {
    return join(await this.getWorkspaceDir(), "web-tasks");
  }

  private async getTaskDir(taskId: string): Promise<string> {
    return join(await this.getTasksDir(), taskId);
  }

  private async getTaskJsonPath(taskId: string): Promise<string> {
    return join(await this.getTaskDir(taskId), "task.json");
  }

  private async getTaskImagesDir(taskId: string): Promise<string> {
    return join(await this.getTaskDir(taskId), "images");
  }

  private async runWordExportScript(draftJsonPath: string, outputPath: string): Promise<void> {
    const pythonPath = await this.resolvePythonExecutablePath();
    const scriptPath = resolve(process.cwd(), "scripts", "export_draft_docx.py");
    await mkdir(dirname(outputPath), { recursive: true });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(pythonPath, [scriptPath, draftJsonPath, outputPath], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        rejectPromise(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }

        rejectPromise(new Error(`Word export failed with code ${code}: ${stderr}`));
      });
    });
  }

  private async runZipArchiveScript(sourceDir: string, outputPath: string): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });
    try {
      await this.runZipWithPowerShell(sourceDir, outputPath);
    } catch (primaryError) {
      try {
        await this.runZipWithTar(sourceDir, outputPath);
      } catch (fallbackError) {
        const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`Images archive export failed. PowerShell: ${primaryMessage}; tar fallback: ${fallbackMessage}`);
      }
    }
  }

  private sanitizeFileName(value: string): string {
    return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "web-task";
  }

  private async runZipWithPowerShell(sourceDir: string, outputPath: string): Promise<void> {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "& { param([string]$SourceDir,[string]$OutputPath) if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force } Compress-Archive -Path (Join-Path $SourceDir '*') -DestinationPath $OutputPath -Force }",
          sourceDir,
          outputPath
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        }
      );

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        rejectPromise(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }

        rejectPromise(new Error(`code=${code}; stderr=${stderr}`));
      });
    });
  }

  private async runZipWithTar(sourceDir: string, outputPath: string): Promise<void> {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(
        "tar.exe",
        ["-a", "-c", "-f", outputPath, "-C", sourceDir, "."],
        {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        }
      );

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        rejectPromise(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }

        rejectPromise(new Error(`code=${code}; stderr=${stderr}`));
      });
    });
  }

  private async resolvePythonExecutablePath(): Promise<string> {
    const bundledPythonPath = join(
      homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "python.exe"
    );

    try {
      await access(bundledPythonPath, constants.X_OK);
      return bundledPythonPath;
    } catch {
      return "python";
    }
  }
}
