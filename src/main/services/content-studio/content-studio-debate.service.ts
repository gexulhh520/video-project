import { randomUUID } from "node:crypto";
import type {
  ContentStudioDebateOptions,
  ContentStudioDebateResult,
  ContentStudioDebateStep,
  ContentStudioModelRole,
  ContentStudioTabModelSettings
} from "../../types/content-studio.types";
import { ContentStudioOpenCliClient } from "./content-studio-opencli-client";

type ResolvedModel = {
  role: ContentStudioModelRole;
  provider: ContentStudioTabModelSettings["modelA"]["provider"];
  profile: string;
};

export class ContentStudioDebateError extends Error {
  constructor(message: string, public readonly steps: ContentStudioDebateStep[]) {
    super(message);
    this.name = "ContentStudioDebateError";
  }
}

export type ContentStudioDebateProgressCallback = (step: ContentStudioDebateStep) => void;

export class ContentStudioDebateService {
  constructor(private readonly openCliClient: ContentStudioOpenCliClient) {}

  async runDebate(
    options: ContentStudioDebateOptions,
    onStepProgress?: ContentStudioDebateProgressCallback
  ): Promise<ContentStudioDebateResult> {
    const steps: ContentStudioDebateStep[] = [];
    const [modelA, modelB] = this.resolveModels(options.settings);
    const reviewRounds = this.resolveReviewRounds(options.input);

    try {
      const planResponse = await this.runStep({
        steps,
        role: modelA.role,
        name: "plan",
        displayName: "模型 A：策划初稿",
        provider: modelA.provider,
        profile: modelA.profile,
        prompt: options.workflow.planPrompt,
        settings: options.settings,
        onStepProgress
      });

      let currentDraft = planResponse;
      let latestReview = "";

      for (let reviewIndex = 1; reviewIndex < reviewRounds; reviewIndex += 1) {
        latestReview = await this.runStep({
          steps,
          role: modelB.role,
          name: "review",
          displayName: `模型 B：第 ${reviewIndex} 次审稿`,
          provider: modelB.provider,
          profile: modelB.profile,
          prompt: `${options.workflow.reviewPrompt}\n\n[模型A当前稿件]\n${currentDraft}`,
          settings: options.settings,
          onStepProgress
        });

        currentDraft = await this.runStep({
          steps,
          role: modelA.role,
          name: "rewrite",
          displayName: `模型 A：第 ${reviewIndex} 次重写`,
          provider: modelA.provider,
          profile: modelA.profile,
          prompt: `${options.workflow.rewritePrompt}\n\n[模型A当前稿件]\n${currentDraft}\n\n[模型B审稿]\n${latestReview}`,
          settings: options.settings,
          onStepProgress
        });
      }

      const finalPromptParts = [options.workflow.finalReviewPrompt, `[模型A当前稿件]\n${currentDraft}`];
      if (latestReview) {
        finalPromptParts.push(`[最近一次模型B审稿]\n${latestReview}`);
      }
      const finalResponse = await this.runStep({
        steps,
        role: modelB.role,
        name: "final_review",
        displayName: "模型 B：终审",
        provider: modelB.provider,
        profile: modelB.profile,
        prompt: finalPromptParts.join("\n\n"),
        settings: options.settings,
        onStepProgress
      });

      return {
        tab: options.tab,
        steps,
        finalResponse
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "双模型讨论失败";
      throw new ContentStudioDebateError(message, steps);
    }
  }

  private async runStep(options: {
    steps: ContentStudioDebateStep[];
    role: ContentStudioModelRole;
    name: ContentStudioDebateStep["name"];
    displayName: string;
    provider: ResolvedModel["provider"];
    profile: string;
    prompt: string;
    settings: ContentStudioTabModelSettings;
    onStepProgress?: ContentStudioDebateProgressCallback;
  }): Promise<string> {
    const step: ContentStudioDebateStep = {
      stepId: randomUUID(),
      role: options.role,
      name: options.name,
      displayName: options.displayName,
      provider: options.provider,
      profile: options.profile,
      prompt: options.prompt,
      response: "",
      startedAt: new Date().toISOString(),
      status: "running"
    };
    options.steps.push(step);
    options.onStepProgress?.(step);

    try {
      const response = await this.openCliClient.ask({
        provider: options.provider,
        profile: options.profile,
        prompt: options.prompt,
        timeoutMs: options.settings.timeoutMs,
        intervalMs: options.settings.pollIntervalMs
      });

      step.response = response;
      step.status = "success";
      step.finishedAt = new Date().toISOString();
      options.onStepProgress?.(step);
      return response;
    } catch (error) {
      step.status = "failed";
      step.finishedAt = new Date().toISOString();
      step.error = error instanceof Error ? error.message : "调用失败";
      options.onStepProgress?.(step);
      throw error;
    }
  }

  private resolveModels(settings: ContentStudioTabModelSettings): [ResolvedModel, ResolvedModel] {
    const enabledModels: ResolvedModel[] = [];
    const modelAProfile = settings.modelA.profile.trim();
    const modelBProfile = settings.modelB.profile.trim();

    if (settings.modelA.enabled && modelAProfile) {
      enabledModels.push({
        role: "modelA",
        provider: settings.modelA.provider,
        profile: modelAProfile
      });
    }

    if (settings.modelB.enabled && modelBProfile) {
      enabledModels.push({
        role: "modelB",
        provider: settings.modelB.provider,
        profile: modelBProfile
      });
    }

    if (enabledModels.length === 0) {
      throw new Error("当前选项卡未配置可用模型，请先在模型配置中填写 Profile。");
    }

    if (enabledModels.length === 1) {
      return [enabledModels[0], enabledModels[0]];
    }

    return [enabledModels[0], enabledModels[1]];
  }

  private resolveReviewRounds(input: unknown): number {
    if (!input || typeof input !== "object") {
      return 2;
    }
    const raw = Number((input as { reviewRounds?: unknown }).reviewRounds);
    if (!Number.isFinite(raw)) {
      return 2;
    }
    return Math.min(5, Math.max(1, Math.floor(raw)));
  }
}
