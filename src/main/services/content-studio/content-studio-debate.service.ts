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

export class ContentStudioDebateService {
  constructor(private readonly openCliClient: ContentStudioOpenCliClient) {}

  async runDebate(options: ContentStudioDebateOptions): Promise<ContentStudioDebateResult> {
    const steps: ContentStudioDebateStep[] = [];
    const [modelA, modelB] = this.resolveModels(options.settings);

    try {
      const planResponse = await this.runStep({
        steps,
        role: modelA.role,
        name: "plan",
        provider: modelA.provider,
        profile: modelA.profile,
        prompt: options.workflow.planPrompt,
        settings: options.settings
      });

      const reviewResponse = await this.runStep({
        steps,
        role: modelB.role,
        name: "review",
        provider: modelB.provider,
        profile: modelB.profile,
        prompt: `${options.workflow.reviewPrompt}\n\n[模型A输出]\n${planResponse}`,
        settings: options.settings
      });

      const rewriteResponse = await this.runStep({
        steps,
        role: modelA.role,
        name: "rewrite",
        provider: modelA.provider,
        profile: modelA.profile,
        prompt: `${options.workflow.rewritePrompt}\n\n[模型A初稿]\n${planResponse}\n\n[模型B审稿]\n${reviewResponse}`,
        settings: options.settings
      });

      const finalResponse = await this.runStep({
        steps,
        role: modelB.role,
        name: "final_review",
        provider: modelB.provider,
        profile: modelB.profile,
        prompt: `${options.workflow.finalReviewPrompt}\n\n[模型A重写稿]\n${rewriteResponse}`,
        settings: options.settings
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
    provider: ResolvedModel["provider"];
    profile: string;
    prompt: string;
    settings: ContentStudioTabModelSettings;
  }): Promise<string> {
    const step: ContentStudioDebateStep = {
      stepId: randomUUID(),
      role: options.role,
      name: options.name,
      provider: options.provider,
      profile: options.profile,
      prompt: options.prompt,
      response: "",
      startedAt: new Date().toISOString(),
      status: "running"
    };
    options.steps.push(step);

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
      return response;
    } catch (error) {
      step.status = "failed";
      step.finishedAt = new Date().toISOString();
      step.error = error instanceof Error ? error.message : "调用失败";
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
}
