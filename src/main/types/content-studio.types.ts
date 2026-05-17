import type { OpenCliProvider, OpenCliProviderStatus } from "./app.types";

export type ContentStudioTabKey = "topic" | "material" | "hot" | "layout";

export type ContentStudioModelRole = "modelA" | "modelB";

export type ContentStudioModelConfig = {
  provider: OpenCliProvider;
  profile: string;
  roleName: string;
  model?: string;
  enabled: boolean;
};

export type ContentStudioTabModelSettings = {
  modelA: ContentStudioModelConfig;
  modelB: ContentStudioModelConfig;
  debateRounds: number;
  pollIntervalMs: number;
  timeoutMs: number;
};

export type ContentStudioImageSettings = {
  enabled: boolean;
  provider: OpenCliProvider;
  profile: string;
  outputDir?: string;
};

export type ContentStudioSettings = {
  openCliCommand: string;
  tabs: Record<ContentStudioTabKey, ContentStudioTabModelSettings>;
  image: ContentStudioImageSettings;
};

export type TopicCreateInput = {
  topic: string;
  platform: "公众号" | "今日头条" | "小红书" | "知乎";
  articleType: "观点文" | "科普文" | "热点解读" | "干货文" | "种草文";
  reviewRounds?: number;
  targetReader?: string;
  writingStyle?: string;
  wordRange?: string;
  generateTitleCandidates?: boolean;
  generateCoverText?: boolean;
  generateImagePlan?: boolean;
};

export type ContentStudioImagePlanType = "source_image" | "ai_generated" | "infographic" | "none";

export type ContentStudioImagePlan = {
  type: ContentStudioImagePlanType;
  prompt?: string;
  caption?: string;
};

export type ContentStudioArticleParagraph = {
  paragraphId: string;
  text: string;
  imagePlan?: ContentStudioImagePlan;
};

export type ContentStudioArticle = {
  title: string;
  titleCandidates?: string[];
  coverText?: string;
  coverSubText?: string;
  coverStyleSuggestion?: string;
  paragraphs: ContentStudioArticleParagraph[];
  tags?: string[];
  riskNotes?: string[];
};

export type ContentStudioDebateStep = {
  stepId: string;
  role: ContentStudioModelRole;
  name: "plan" | "review" | "rewrite" | "final_review";
  displayName: string;
  provider: OpenCliProvider;
  profile: string;
  prompt: string;
  response: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "failed";
  error?: string;
};

export type ContentStudioDebateWorkflow = {
  planPrompt: string;
  reviewPrompt: string;
  rewritePrompt: string;
  finalReviewPrompt: string;
};

export type ContentStudioDebateOptions = {
  tab: ContentStudioTabKey;
  taskId: string;
  input: unknown;
  settings: ContentStudioTabModelSettings;
  workflow: ContentStudioDebateWorkflow;
};

export type ContentStudioDebateResult = {
  tab: ContentStudioTabKey;
  steps: ContentStudioDebateStep[];
  finalResponse: string;
};

export type ContentStudioTaskStatus = "idle" | "running" | "completed" | "failed";

export type ContentStudioTask = {
  taskId: string;
  tab: ContentStudioTabKey;
  title: string;
  status: ContentStudioTaskStatus;
  createdAt: string;
  updatedAt: string;
  input: unknown;
  settingsSnapshot: ContentStudioTabModelSettings;
  debateSteps: ContentStudioDebateStep[];
  result?: ContentStudioArticle;
  imageAssets: unknown[];
  error?: string;
};

export type ContentStudioTaskSummary = {
  taskId: string;
  tab: ContentStudioTabKey;
  title: string;
  status: ContentStudioTaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContentStudioTopicProgressStatus =
  | "queued"
  | "running_step"
  | "parsing_result"
  | "completed"
  | "failed";

export type ContentStudioTopicProgress = {
  taskId: string;
  tab: "topic";
  status: ContentStudioTopicProgressStatus;
  progress: number;
  message: string;
  stepName?: ContentStudioDebateStep["name"];
  role?: ContentStudioModelRole;
  provider?: OpenCliProvider;
  profile?: string;
  updatedAt: string;
};

export type ContentStudioTabConfigStatus = {
  tab: ContentStudioTabKey;
  ready: boolean;
  missingItems: string[];
  hasAnyModelEnabled: boolean;
};

export type ContentStudioConfigStatus = {
  ready: boolean;
  hasOpenCliCommand: boolean;
  hasAtLeastOneTabReady: boolean;
  tabs: Record<ContentStudioTabKey, ContentStudioTabConfigStatus>;
  missingItems: string[];
};

export type TestContentStudioModelOptions = {
  tab: ContentStudioTabKey;
  role: ContentStudioModelRole;
  provider: OpenCliProvider;
  profile: string;
};

export type ContentStudioTestModelResult = OpenCliProviderStatus;

export const CONTENT_STUDIO_TAB_LABELS: Record<ContentStudioTabKey, string> = {
  topic: "话题成文",
  material: "素材二创",
  hot: "热点成文",
  layout: "图文排版"
};

export const CONTENT_STUDIO_TAB_KEYS: ContentStudioTabKey[] = ["topic", "material", "hot", "layout"];
