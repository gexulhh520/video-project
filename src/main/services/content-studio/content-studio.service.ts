import { parseOpenCliJson } from "../opencli/opencli-output-parser";
import type {
  ContentStudioArticle,
  ContentStudioArticleParagraph,
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

  async runTopicCreate(input: TopicCreateInput): Promise<ContentStudioTask> {
    const normalizedInput = this.normalizeTopicInput(input);
    const configStatus = await this.settingsService.getConfigStatus();
    if (!configStatus.tabs.topic.ready) {
      throw new Error(`话题成文配置未完成：${configStatus.tabs.topic.missingItems.join("、") || "请先完成模型配置"}`);
    }

    const studioSettings = await this.settingsService.getSettings();
    const tabSettings = studioSettings.tabs.topic;

    let task = await this.taskStore.createTask("topic", normalizedInput.topic, normalizedInput, tabSettings);
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
      });

      const article = this.parseArticleResult(debateResult.finalResponse, normalizedInput.topic);

      task = await this.taskStore.saveTask({
        ...task,
        status: "completed",
        debateSteps: debateResult.steps,
        result: article,
        error: undefined
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
    try {
      const parsed = parseOpenCliJson<Partial<ContentStudioArticle>>(rawOutput);
      return this.normalizeArticle(parsed, fallbackTitle);
    } catch {
      return this.fallbackArticleFromText(rawOutput, fallbackTitle);
    }
  }

  private normalizeArticle(article: Partial<ContentStudioArticle>, fallbackTitle: string): ContentStudioArticle {
    const title = String(article.title || "").trim() || fallbackTitle;
    const coverText = String(article.coverText || "").trim() || undefined;
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
                    type: paragraph.imagePlan.type || "none",
                    description: String(paragraph.imagePlan.description || "").trim() || "配图待补充",
                    aiPrompt: paragraph.imagePlan.aiPrompt?.trim() || undefined
                  }
                : undefined
            } as ContentStudioArticleParagraph;
          })
          .filter((item): item is ContentStudioArticleParagraph => Boolean(item))
      : [];

    if (!paragraphs.length) {
      return this.fallbackArticleFromText(JSON.stringify(article), title);
    }

    const tags = Array.isArray(article.tags)
      ? article.tags.map((item) => String(item || "").trim()).filter((item) => Boolean(item))
      : undefined;
    const riskNotes = Array.isArray(article.riskNotes)
      ? article.riskNotes.map((item) => String(item || "").trim()).filter((item) => Boolean(item))
      : undefined;

    return {
      title,
      coverText,
      paragraphs,
      tags: tags?.length ? tags : undefined,
      riskNotes: riskNotes?.length ? riskNotes : undefined
    };
  }

  private fallbackArticleFromText(rawOutput: string, fallbackTitle: string): ContentStudioArticle {
    const lines = String(rawOutput || "")
      .replace(/```json|```/gi, "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => Boolean(line));

    const paragraphs = (lines.length ? lines : ["模型返回非结构化文本，请手动整理后发布。"])
      .map((text, index) => ({
        paragraphId: `p${index + 1}`,
        text
      }));

    return {
      title: fallbackTitle,
      paragraphs,
      riskNotes: ["模型输出未完全结构化，建议人工校对后发布。"]
    };
  }
}
