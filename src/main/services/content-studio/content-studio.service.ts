import { parseOpenCliJson } from "../opencli/opencli-output-parser";
import type {
  ContentStudioArticle,
  ContentStudioArticleParagraph,
  ContentStudioTopicProgress,
  ContentStudioTask,
  ContentStudioTaskSummary,
  TopicCreateInput
} from "../../types/content-studio.types";
import { ContentStudioTaskStore } from "./content-studio-task-store";
import { ContentStudioDebateError, ContentStudioDebateService } from "./content-studio-debate.service";
import { ContentStudioSettingsService } from "./content-studio-settings.service";
import {
  buildTopicFinalReviewPrompt,
  buildTopicPlanPrompt,
  buildTopicReviewPrompt,
  buildTopicRewritePrompt
} from "./content-studio-prompts";

export class ContentStudioService {
  constructor(
    private readonly taskStore: ContentStudioTaskStore,
    private readonly settingsService: ContentStudioSettingsService,
    private readonly debateService: ContentStudioDebateService
  ) {}

  async listTasks(): Promise<ContentStudioTaskSummary[]> {
    return this.taskStore.listTasks();
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

    const planPrompt = buildTopicPlanPrompt(normalizedInput);
    const reviewPrompt = buildTopicReviewPrompt(normalizedInput, "请基于上一轮模型A输出进行审稿。保持 JSON 输出。");
    const rewritePrompt = buildTopicRewritePrompt(normalizedInput, "请基于上一轮模型A初稿进行重写。", "请基于上一轮模型B审稿意见进行修正。");
    const finalReviewPrompt = buildTopicFinalReviewPrompt(normalizedInput, "请基于上一轮模型A重写稿进行终审并修正。");

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
        const progressMap: Record<typeof step.name, number> = {
          plan: 18,
          review: 38,
          rewrite: 62,
          final_review: 82
        };
        const stepLabelMap: Record<typeof step.name, string> = {
          plan: "模型A：选题策划",
          review: "模型B：反方审稿",
          rewrite: "模型A：重构初稿",
          final_review: "模型B：终审"
        };
        const stateText = step.status === "running" ? "正在调用" : step.status === "success" ? "已完成" : "失败";
        this.emitTopicProgress(onProgress, task.taskId, {
          status: step.status === "failed" ? "failed" : "running_step",
          progress: progressMap[step.name],
          message: `${stateText}${stepLabelMap[step.name]}`,
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
      targetReader: input.targetReader?.trim() || undefined,
      writingStyle: input.writingStyle?.trim() || undefined,
      wordRange: input.wordRange?.trim() || undefined
    };
  }

  private parseArticleResult(rawOutput: string, fallbackTitle: string): ContentStudioArticle {
    const candidates = this.collectArticleJsonCandidates(rawOutput);
    let best: { article: ContentStudioArticle; score: number } | null = null;
    let firstErrorMessage = "";

    for (const candidate of candidates) {
      try {
        const parsed = parseOpenCliJson<Partial<ContentStudioArticle>>(candidate);
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
      const parsed = parseOpenCliJson<Partial<ContentStudioArticle>>(rawOutput);
      return this.normalizeArticle(parsed, fallbackTitle);
    } catch (error) {
      const message = firstErrorMessage || (error instanceof Error ? error.message : "JSON 解析失败");
      throw new Error(`最终文章 JSON 解析失败：${message}`);
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
    const riskNotes = Array.isArray(article.riskNotes)
      ? article.riskNotes.map((item) => String(item || "").trim()).filter((item) => Boolean(item))
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
    const text = String(rawOutput || "").trim();
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
