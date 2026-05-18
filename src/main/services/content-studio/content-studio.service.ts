import { parseOpenCliJson, parseOpenCliModelJson, repairWebLlmJsonText } from "../opencli/opencli-output-parser";
import type {
  ContentStudioArticle,
  ContentStudioArticleParagraph,
  ContentStudioMaterialPack,
  ContentStudioMaterialProgress,
  ContentStudioTopicProgress,
  ContentStudioTask,
  ContentStudioTaskSummary,
  MaterialRewriteInput,
  MaterialSourceType,
  TopicCreateInput
} from "../../types/content-studio.types";
import { runPythonTool } from "../python-tool-runner";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ContentStudioTaskStore } from "./content-studio-task-store";
import { ContentStudioDebateError, ContentStudioDebateService } from "./content-studio-debate.service";
import { ContentStudioSettingsService } from "./content-studio-settings.service";
import {
  buildMaterialArticleDraftPrompt,
  buildMaterialArticleReviewPrompt,
  buildMaterialArticleRewritePrompt,
  buildMaterialFinalReviewPrompt,
  buildMaterialFinalTopicDecisionPrompt,
  buildMaterialSourceAnalysisPrompt,
  buildMaterialTopicGeneratePrompt,
  buildMaterialTopicReviewPrompt,
  buildMaterialTopicRewritePrompt,
  buildTopicFinalReviewPrompt,
  buildTopicPlanPrompt,
  buildTopicReviewPrompt,
  buildTopicRewritePrompt
} from "./content-studio-prompts";
import { ContentStudioResourceService } from "./content-studio-resource.service";

export class ContentStudioService {
  constructor(
    private readonly taskStore: ContentStudioTaskStore,
    private readonly settingsService: ContentStudioSettingsService,
    private readonly debateService: ContentStudioDebateService,
    private readonly resourceService: ContentStudioResourceService
  ) {}

  async listTasks(): Promise<ContentStudioTaskSummary[]> {
    return this.taskStore.listTasks();
  }

  async addMaterialText(options: {
    topic?: string;
    title?: string;
    body: string;
    current?: ContentStudioMaterialPack;
    maxSourceCount?: number;
  }): Promise<ContentStudioMaterialPack> {
    const body = String(options.body || "").trim();
    if (!body) {
      throw new Error("文本素材不能为空");
    }
    return this.pushMaterialSource(options.current, {
      sourceId: this.createSourceId(),
      type: "text",
      title: String(options.title || "").trim() || this.detectTitleFromBody(body),
      body,
      images: []
    }, options.maxSourceCount);
  }

  async addMaterialUrl(options: {
    url: string;
    title?: string;
    current?: ContentStudioMaterialPack;
    collectImagesFromUrl?: boolean;
    maxSourceCount?: number;
  }): Promise<ContentStudioMaterialPack> {
    const targetUrl = String(options.url || "").trim();
    if (!targetUrl) {
      throw new Error("URL 不能为空");
    }
    const collected = await this.resourceService.collectFromUrl(targetUrl, {
      collectImages: options.collectImagesFromUrl ?? true
    });
    return this.pushMaterialSource(options.current, {
      sourceId: this.createSourceId(),
      type: "url",
      title: String(options.title || "").trim() || collected.title || targetUrl,
      url: targetUrl,
      body: collected.body,
      images: collected.images
    }, options.maxSourceCount);
  }

  async addMaterialWord(options: {
    filePath: string;
    title?: string;
    current?: ContentStudioMaterialPack;
    maxSourceCount?: number;
  }): Promise<ContentStudioMaterialPack> {
    const filePath = String(options.filePath || "").trim();
    if (!filePath) {
      throw new Error("Word 文件路径不能为空");
    }
    const sourceId = this.createSourceId();
    const outputImageDir = join(process.cwd(), "content-studio", "word-import", sourceId);
    await mkdir(outputImageDir, { recursive: true });
    const { stdout } = await runPythonTool("import_word_docx", "import_word_docx.py", [filePath, outputImageDir], {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1"
    });
    let payload: { title?: string; paragraphs?: string[]; sectionImages?: string[][] };
    try {
      payload = JSON.parse(stdout) as { title?: string; paragraphs?: string[]; sectionImages?: string[][] };
    } catch (error) {
      throw new Error(`Word 导入结果解析失败：${error instanceof Error ? error.message : String(error)}`);
    }
    const paragraphs = Array.isArray(payload.paragraphs)
      ? payload.paragraphs.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const body = paragraphs.join("\n\n").trim();
    if (!body) {
      throw new Error("Word 未检测到可用正文");
    }
    const images = (payload.sectionImages || [])
      .flat()
      .map((path) => String(path || "").trim())
      .filter(Boolean)
      .map((localPath) => ({
        assetId: randomUUID(),
        sourceType: "source" as const,
        fileName: localPath.split(/[\\/]/).pop() || "word-image.png",
        localPath,
        createdAt: new Date().toISOString(),
        sourceRef: filePath
      }));
    return this.pushMaterialSource(options.current, {
      sourceId,
      type: "word",
      title: String(options.title || "").trim() || String(payload.title || "").trim() || "Word 素材",
      body,
      images
    }, options.maxSourceCount);
  }

  async runMaterialRewrite(
    input: MaterialRewriteInput,
    onProgress?: (progress: ContentStudioMaterialProgress) => void
  ): Promise<ContentStudioTask> {
    const normalizedInput = this.normalizeMaterialInput(input);
    const configStatus = await this.settingsService.getConfigStatus();
    if (!configStatus.tabs.material.ready) {
      throw new Error(`素材二创配置未完成：${configStatus.tabs.material.missingItems.join("、") || "请先完成模型配置"}`);
    }
    const studioSettings = await this.settingsService.getSettings();
    const tabSettings = studioSettings.tabs.material;
    const materialPack = this.buildMaterialPack(normalizedInput);
    let task = await this.taskStore.createTask("material", normalizedInput.topic || "素材二创", normalizedInput, tabSettings);
    task = await this.taskStore.saveTask({
      ...task,
      status: "running",
      materialPack
    });
    this.emitMaterialProgress(onProgress, task.taskId, {
      status: "queued",
      progress: 2,
      message: "素材任务已创建。"
    });

    const [modelA, modelB] = this.debateService.resolveEnabledModels(tabSettings);
    const steps: ContentStudioTask["debateSteps"] = [];
    const runStep = async (
      role: "modelA" | "modelB",
      name: ContentStudioTask["debateSteps"][number]["name"],
      displayName: string,
      prompt: string
    ): Promise<string> => {
      const model = role === "modelA" ? modelA : modelB;
      const response = await this.debateService.runAdHocStep({
        steps,
        role,
        name,
        displayName,
        provider: model.provider,
        profile: model.profile,
        prompt,
        settings: tabSettings,
        onStepProgress: (step) => {
          const progressMap: Record<string, number> = {
            source_analysis: 10,
            topic_generate: 20,
            topic_review: 30,
            topic_rewrite: 40,
            topic_final_decision: 52,
            article_draft: 62,
            article_review: 74,
            article_rewrite: 84,
            article_final_review: 94
          };
          this.emitMaterialProgress(onProgress, task.taskId, {
            status: step.status === "failed" ? "failed" : "running_step",
            progress: progressMap[step.name] || 30,
            message: `${step.status === "running" ? "正在执行" : step.status === "success" ? "完成" : "失败"}${step.displayName}`,
            stepName: step.name,
            role: step.role,
            provider: step.provider,
            profile: step.profile
          });
        }
      });
      task = await this.taskStore.saveTask({ ...task, debateSteps: steps });
      return response;
    };

    try {
      const sourceAnalysis = await runStep(
        "modelA",
        "source_analysis",
        "模型A：原文分析",
        buildMaterialSourceAnalysisPrompt(normalizedInput, materialPack, tabSettings.modelA.roleName)
      );
      let topicAngles = await runStep(
        "modelA",
        "topic_generate",
        "模型A：生成5个选题",
        buildMaterialTopicGeneratePrompt(normalizedInput, materialPack, sourceAnalysis, tabSettings.modelA.roleName)
      );

      let latestTopicReview = "";
      const topicRounds = this.normalizeReviewRounds(normalizedInput.topicReviewRounds);
      for (let i = 1; i <= topicRounds; i += 1) {
        latestTopicReview = await runStep(
          "modelB",
          "topic_review",
          `模型B：第${i}轮选题评审`,
          buildMaterialTopicReviewPrompt(normalizedInput, sourceAnalysis, topicAngles, tabSettings.modelB.roleName)
        );
        if (i < topicRounds) {
          topicAngles = await runStep(
            "modelA",
            "topic_rewrite",
            `模型A：第${i}轮选题优化`,
            buildMaterialTopicRewritePrompt(normalizedInput, topicAngles, latestTopicReview, tabSettings.modelA.roleName)
          );
        }
      }

      const finalTopic = await runStep(
        "modelB",
        "topic_final_decision",
        "模型B：最终选题定稿",
        buildMaterialFinalTopicDecisionPrompt(normalizedInput, topicAngles, tabSettings.modelB.roleName)
      );

      let articleDraft = await runStep(
        "modelA",
        "article_draft",
        "模型A：正文初稿",
        buildMaterialArticleDraftPrompt(normalizedInput, materialPack, finalTopic, tabSettings.modelA.roleName)
      );
      let latestArticleReview = "";
      const articleRounds = this.normalizeReviewRounds(normalizedInput.articleReviewRounds);
      for (let i = 1; i <= articleRounds; i += 1) {
        latestArticleReview = await runStep(
          "modelB",
          "article_review",
          `模型B：第${i}轮正文审稿`,
          buildMaterialArticleReviewPrompt(normalizedInput, materialPack, articleDraft, tabSettings.modelB.roleName)
        );
        if (i < articleRounds) {
          articleDraft = await runStep(
            "modelA",
            "article_rewrite",
            `模型A：第${i}轮正文改稿`,
            buildMaterialArticleRewritePrompt(normalizedInput, materialPack, articleDraft, latestArticleReview, tabSettings.modelA.roleName)
          );
        }
      }

      const finalReviewRaw = await runStep(
        "modelB",
        "article_final_review",
        "模型B：最终验收",
        buildMaterialFinalReviewPrompt(normalizedInput, materialPack, articleDraft, tabSettings.modelB.roleName)
      );

      this.emitMaterialProgress(onProgress, task.taskId, {
        status: "parsing_result",
        progress: 97,
        message: "正在解析最终文章和验收结果。"
      });

      const article = this.parseArticleResult(articleDraft, normalizedInput.topic || "素材二创");
      const finalReview = this.parseFinalReview(finalReviewRaw);
      task = await this.taskStore.saveTask({
        ...task,
        status: "completed",
        materialPack,
        debateSteps: steps,
        result: article,
        finalReview,
        error: undefined
      });
      this.emitMaterialProgress(onProgress, task.taskId, {
        status: "completed",
        progress: 100,
        message: "素材二创完成。"
      });
      return task;
    } catch (error) {
      task = await this.taskStore.saveTask({
        ...task,
        status: "failed",
        materialPack,
        debateSteps: steps,
        error: error instanceof Error ? error.message : "素材二创执行失败"
      });
      this.emitMaterialProgress(onProgress, task.taskId, {
        status: "failed",
        progress: 100,
        message: task.error || "素材二创执行失败。"
      });
      return task;
    }
  }

  async getTaskById(taskId: string): Promise<ContentStudioTask> {
    const task = await this.taskStore.getTaskById(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    return task;
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.taskStore.deleteTask(taskId);
  }

  async runTopicCreate(
    input: TopicCreateInput,
    onProgress?: (progress: ContentStudioTopicProgress) => void
  ): Promise<ContentStudioTask> {
    const normalizedInput = this.normalizeTopicInput(input);
    const configStatus = await this.settingsService.getConfigStatus();
    if (!configStatus.tabs.topic.ready) {
      throw new Error(`话题成文配置未完成：${configStatus.tabs.topic.missingItems.join("、") || "请先完成模型配置"}`);
    }

    const studioSettings = await this.settingsService.getSettings();
    const tabSettings = studioSettings.tabs.topic;

    let task = await this.taskStore.createTask("topic", normalizedInput.topic, normalizedInput, tabSettings);
    this.emitTopicProgress(onProgress, task.taskId, {
      status: "queued",
      progress: 2,
      message: "任务已创建，准备开始双模型讨论。"
    });
    task = await this.taskStore.saveTask({
      ...task,
      status: "running"
    });

    const promptRoles = {
      modelARoleName: tabSettings.modelA.roleName,
      modelBRoleName: tabSettings.modelB.roleName
    };
    const planPrompt = buildTopicPlanPrompt(normalizedInput, promptRoles);
    const reviewPrompt = buildTopicReviewPrompt(
      normalizedInput,
      "请基于上一轮模型A输出进行审稿。保持 JSON 输出。",
      promptRoles
    );
    const rewritePrompt = buildTopicRewritePrompt(
      normalizedInput,
      "请基于上一轮模型A初稿进行重写。",
      "请基于上一轮模型B审稿意见进行修正。",
      promptRoles
    );
    const finalReviewPrompt = buildTopicFinalReviewPrompt(
      normalizedInput,
      "请基于模型A当前稿件进行终审并修正。",
      promptRoles
    );
    const reviewRounds = normalizedInput.reviewRounds ?? 2;
    const totalDebateSteps = Math.max(2, reviewRounds * 2);
    const stepOrderMap = new Map<string, number>();
    let nextStepOrder = 0;

    try {
      const debateResult = await this.debateService.runDebate({
        tab: "topic",
        taskId: task.taskId,
        input: normalizedInput,
        settings: tabSettings,
        workflow: {
          planPrompt,
          reviewPrompt,
          rewritePrompt,
          finalReviewPrompt
        }
      }, (step) => {
        const stepOrder = stepOrderMap.get(step.stepId) ?? (() => {
          nextStepOrder += 1;
          stepOrderMap.set(step.stepId, nextStepOrder);
          return nextStepOrder;
        })();
        const progressBase = 10;
        const progressSpan = 76;
        const dynamicProgress = Math.min(
          90,
          progressBase + Math.floor((Math.min(stepOrder, totalDebateSteps) / totalDebateSteps) * progressSpan)
        );
        const stateText = step.status === "running" ? "正在调用" : step.status === "success" ? "已完成" : "失败";
        this.emitTopicProgress(onProgress, task.taskId, {
          status: step.status === "failed" ? "failed" : "running_step",
          progress: dynamicProgress,
          message: `${stateText}${step.displayName}`,
          stepName: step.name,
          role: step.role,
          provider: step.provider,
          profile: step.profile
        });
      });

      this.emitTopicProgress(onProgress, task.taskId, {
        status: "parsing_result",
        progress: 92,
        message: "正在解析最终文章 JSON。"
      });
      const article = this.parseArticleResult(debateResult.finalResponse, normalizedInput.topic);

      task = await this.taskStore.saveTask({
        ...task,
        status: "completed",
        debateSteps: debateResult.steps,
        result: article,
        error: undefined
      });
      this.emitTopicProgress(onProgress, task.taskId, {
        status: "completed",
        progress: 100,
        message: "话题成文完成。"
      });

      return task;
    } catch (error) {
      const debateSteps = error instanceof ContentStudioDebateError ? error.steps : task.debateSteps;
      task = await this.taskStore.saveTask({
        ...task,
        status: "failed",
        debateSteps,
        error: error instanceof Error ? error.message : "话题成文执行失败"
      });
      this.emitTopicProgress(onProgress, task.taskId, {
        status: "failed",
        progress: 100,
        message: task.error || "话题成文执行失败。"
      });
      return task;
    }
  }

  private normalizeTopicInput(input: TopicCreateInput): TopicCreateInput {
    const topic = input.topic?.trim();
    if (!topic) {
      throw new Error("请输入话题");
    }

    return {
      ...input,
      topic,
      reviewRounds: this.normalizeReviewRounds(input.reviewRounds),
      targetReader: input.targetReader?.trim() || undefined,
      writingStyle: input.writingStyle?.trim() || undefined,
      wordRange: input.wordRange?.trim() || undefined
    };
  }

  private normalizeReviewRounds(value: number | undefined): number {
    if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
      return 2;
    }
    return Math.min(5, Math.max(1, Math.floor(value)));
  }

  private normalizeMaterialInput(input: MaterialRewriteInput): MaterialRewriteInput {
    const normalizedSources = (input.sources || [])
      .map((source) => ({
        sourceId: String(source.sourceId || "").trim() || this.createSourceId(),
        type: (source.type || "text") as MaterialSourceType,
        title: String(source.title || "").trim() || undefined,
        url: String(source.url || "").trim() || undefined,
        body: String(source.body || "").trim(),
        images: Array.isArray(source.images) ? source.images : []
      }))
      .filter((source) => Boolean(source.body));
    if (!normalizedSources.length) {
      throw new Error("请先添加至少一条素材");
    }
    return {
      ...input,
      topic: String(input.topic || "").trim() || undefined,
      targetReader: String(input.targetReader || "").trim() || undefined,
      writingStyle: String(input.writingStyle || "").trim() || undefined,
      wordRange: String(input.wordRange || "").trim() || undefined,
      topicReviewRounds: this.normalizeReviewRounds(input.topicReviewRounds),
      articleReviewRounds: this.normalizeReviewRounds(input.articleReviewRounds),
      maxSourceCount: Math.min(10, Math.max(1, Math.floor(Number(input.maxSourceCount || 5)))),
      sources: normalizedSources
    };
  }

  private buildMaterialPack(input: MaterialRewriteInput): ContentStudioMaterialPack {
    return {
      topic: input.topic,
      sources: input.sources.map((source) => ({
        sourceId: source.sourceId,
        type: source.type,
        title: source.title,
        url: source.url,
        body: source.body,
        images: source.images || []
      }))
    };
  }

  private pushMaterialSource(
    current: ContentStudioMaterialPack | undefined,
    source: ContentStudioMaterialPack["sources"][number],
    maxSourceCount?: number
  ): ContentStudioMaterialPack {
    const limit = Math.min(10, Math.max(1, Math.floor(Number(maxSourceCount || 5))));
    const nextSources = [...(current?.sources || []), { ...source, images: source.images || [] }];
    if (nextSources.length > limit) {
      throw new Error(`素材数量已达上限（${limit}）`);
    }
    return {
      topic: current?.topic,
      sources: nextSources
    };
  }

  private createSourceId(): string {
    return `source_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private detectTitleFromBody(body: string): string {
    const first = body.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length >= 6);
    return first ? first.slice(0, 40) : "文本素材";
  }

  private parseFinalReview(rawOutput: string): {
    verdict: "pass" | "revise";
    publishable?: boolean;
    originalityScore?: number;
    viralPotentialScore?: number;
    similarityRisk?: "low" | "medium" | "high";
    riskNotes?: string[];
  } {
    const candidates = this.collectArticleJsonCandidates(rawOutput);
    for (const candidate of candidates) {
      try {
        const parsed = parseOpenCliJson<Record<string, unknown>>(candidate);
        const verdictRaw = String(parsed.verdict || "").trim().toLowerCase();
        const verdict = verdictRaw === "pass" ? "pass" : "revise";
        const similarityRaw = String(parsed.similarityRisk || "").trim().toLowerCase();
        const similarityRisk = similarityRaw === "low" || similarityRaw === "medium" || similarityRaw === "high"
          ? similarityRaw
          : undefined;
        const riskNotes = Array.isArray(parsed.riskNotes)
          ? parsed.riskNotes.map((item) => String(item || "").trim()).filter(Boolean)
          : undefined;
        return {
          verdict,
          publishable: typeof parsed.publishable === "boolean" ? parsed.publishable : undefined,
          originalityScore: this.normalizeOptionalScore(parsed.originalityScore),
          viralPotentialScore: this.normalizeOptionalScore(parsed.viralPotentialScore),
          similarityRisk,
          riskNotes: riskNotes?.length ? riskNotes : undefined
        };
      } catch {
        // Continue.
      }
    }
    return { verdict: "revise", riskNotes: ["最终验收 JSON 解析失败"] };
  }

  private normalizeOptionalScore(value: unknown): number | undefined {
    const score = Number(value);
    if (!Number.isFinite(score)) {
      return undefined;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private emitMaterialProgress(
    onProgress: ((progress: ContentStudioMaterialProgress) => void) | undefined,
    taskId: string,
    payload: Omit<ContentStudioMaterialProgress, "taskId" | "tab" | "updatedAt">
  ): void {
    onProgress?.({
      taskId,
      tab: "material",
      updatedAt: new Date().toISOString(),
      ...payload
    });
  }

  private parseArticleResult(rawOutput: string, fallbackTitle: string): ContentStudioArticle {
    const candidates = this.collectArticleJsonCandidates(rawOutput);
    let best: { article: ContentStudioArticle; score: number } | null = null;
    let firstErrorMessage = "";

    for (const candidate of candidates) {
      try {
        const parsed = parseOpenCliModelJson<Partial<ContentStudioArticle>>(candidate);
        const article = this.normalizeArticle(parsed, fallbackTitle);
        const score = this.scoreArticle(article);
        if (!best || score > best.score) {
          best = { article, score };
        }
      } catch (error) {
        if (!firstErrorMessage) {
          firstErrorMessage = error instanceof Error ? error.message : "JSON 解析失败";
        }
      }
    }

    if (best) {
      return best.article;
    }

    try {
      const parsed = parseOpenCliModelJson<Partial<ContentStudioArticle>>(rawOutput);
      return this.normalizeArticle(parsed, fallbackTitle);
    } catch (error) {
      const message = firstErrorMessage || (error instanceof Error ? error.message : "JSON 解析失败");
      const preview = String(rawOutput || "")
        .slice(0, 500)
        .replace(/\s+/g, " ");
      throw new Error(`最终文章 JSON 解析失败：${message}。原始输出前500字：${preview}`);
    }
  }

  private normalizeArticle(article: Partial<ContentStudioArticle>, fallbackTitle: string): ContentStudioArticle {
    const title = String(article.title || "").trim() || fallbackTitle;
    const coverText = String(article.coverText || "").trim() || undefined;
    const coverSubText = String(article.coverSubText || "").trim() || undefined;
    const coverStyleSuggestion = String(article.coverStyleSuggestion || "").trim() || undefined;
    const paragraphs = Array.isArray(article.paragraphs)
      ? article.paragraphs
          .map((paragraph, index) => {
            const text = String(paragraph?.text || "").trim();
            if (!text) {
              return null;
            }

            return {
              paragraphId: String(paragraph?.paragraphId || `p${index + 1}`).trim() || `p${index + 1}`,
              text,
              imagePlan: paragraph?.imagePlan
                ? {
                    type: this.normalizeImagePlanType(String(paragraph.imagePlan.type || "").trim()),
                    caption:
                      String(
                        paragraph.imagePlan.caption ||
                        (paragraph.imagePlan as { description?: string }).description ||
                        ""
                      ).trim() || undefined,
                    prompt:
                      String(
                        paragraph.imagePlan.prompt ||
                        (paragraph.imagePlan as { aiPrompt?: string }).aiPrompt ||
                        ""
                      ).trim() || undefined
                  }
                : undefined
            } as ContentStudioArticleParagraph;
          })
          .filter((item): item is ContentStudioArticleParagraph => Boolean(item))
      : [];

    if (!paragraphs.length) {
      throw new Error("最终文章缺少有效正文段落");
    }

    const titleCandidates = Array.isArray(article.titleCandidates)
      ? article.titleCandidates.map((item) => String(item || "").trim()).filter((item) => Boolean(item))
      : undefined;
    const tags = Array.isArray(article.tags)
      ? article.tags.map((item) => String(item || "").trim()).filter((item) => Boolean(item))
      : undefined;
    const rawRiskNotes = article.riskNotes as unknown;
    const riskNotes = Array.isArray(rawRiskNotes)
      ? rawRiskNotes.map((item) => String(item || "").trim()).filter((item) => Boolean(item))
      : typeof rawRiskNotes === "string" && rawRiskNotes.trim()
        ? [rawRiskNotes.trim()]
        : undefined;

    return {
      title,
      titleCandidates: titleCandidates?.length ? titleCandidates : undefined,
      coverText,
      coverSubText,
      coverStyleSuggestion,
      paragraphs,
      tags: tags?.length ? tags : undefined,
      riskNotes: riskNotes?.length ? riskNotes : undefined
    };
  }

  private normalizeImagePlanType(type: string): "source_image" | "ai_generated" | "infographic" | "none" {
    if (type === "source_image" || type === "ai_generated" || type === "infographic" || type === "none") {
      return type;
    }

    if (type === "real") {
      return "source_image";
    }

    if (type === "ai") {
      return "ai_generated";
    }

    if (type === "screenshot") {
      return "source_image";
    }

    return "none";
  }

  private emitTopicProgress(
    onProgress: ((progress: ContentStudioTopicProgress) => void) | undefined,
    taskId: string,
    payload: Omit<ContentStudioTopicProgress, "taskId" | "tab" | "updatedAt">
  ): void {
    onProgress?.({
      taskId,
      tab: "topic",
      updatedAt: new Date().toISOString(),
      ...payload
    });
  }

  private collectArticleJsonCandidates(rawOutput: string): string[] {
    const text = repairWebLlmJsonText(String(rawOutput || "").trim());
    if (!text) {
      return [];
    }

    const candidates: string[] = [];
    const pushUnique = (value: string) => {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return;
      }
      if (!candidates.includes(normalized)) {
        candidates.push(normalized);
      }
    };

    pushUnique(text);

    const fencedMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
    for (const match of fencedMatches) {
      pushUnique(match[1] || "");
    }

    for (const slice of this.extractJsonObjectSlices(text, 40)) {
      pushUnique(slice);
    }

    return candidates;
  }

  private extractJsonObjectSlices(text: string, maxCount: number): string[] {
    const slices: string[] = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{") {
        if (depth === 0) {
          start = i;
        }
        depth += 1;
        continue;
      }

      if (char === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          slices.push(text.slice(start, i + 1));
          if (slices.length >= maxCount) {
            return slices;
          }
          start = -1;
        }
      }
    }

    return slices;
  }

  private scoreArticle(article: ContentStudioArticle): number {
    const paragraphChars = article.paragraphs.reduce((sum, paragraph) => sum + paragraph.text.length, 0);
    const imagePlanCount = article.paragraphs.reduce((sum, paragraph) => (paragraph.imagePlan ? sum + 1 : sum), 0);
    return (
      article.paragraphs.length * 100 +
      Math.min(paragraphChars, 6000) +
      (article.title ? 20 : 0) +
      (article.tags?.length || 0) * 3 +
      (article.riskNotes?.length || 0) * 2 +
      imagePlanCount * 2
    );
  }
}



