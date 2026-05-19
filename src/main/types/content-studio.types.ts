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
  topicAdvanced: TopicAdvancedSettings;
};

export type TopicAdvancedSettings = {
  reviewRounds: number;
  targetReader: string;
  writingStyle: string;
  wordRange: string;
  generateTitleCandidates: boolean;
  generateCoverText: boolean;
  generateImagePlan: boolean;
  enableTopicResearch: boolean;
  maxMaterialCount: number;
  materialSummaryMaxWords: number;
  materialSearchMode: "sequential";
  requireRiskNotes: boolean;
  requireSourceUrl: boolean;
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
  enableTopicResearch?: boolean;
  maxMaterialCount?: number;
  materialSummaryMaxWords?: number;
  materialSearchMode?: "sequential";
  requireRiskNotes?: boolean;
  requireSourceUrl?: boolean;
};

export type TopicResearchPlanItem = {
  materialId: string;
  query: string;
  purpose: string;
  preferredSourceType: "official" | "media" | "community" | "case" | "industry" | "other";
  required: boolean;
  riskNotes: string[];
};

export type TopicSelectedTopic = {
  title: string;
  coreThesis: string;
  contentType: string;
  targetPlatform: string;
  reason: string;
};

export type TopicResearchMaterialCard = {
  materialId: string;
  query: string;
  title: string;
  sourceType: "official" | "media" | "community" | "case" | "industry" | "other";
  sourceUrl?: string;
  summary: string;
  usablePoints: string[];
  riskNotes: string[];
  confidence: "high" | "medium" | "low";
  status: "success" | "failed" | "skipped";
  errorMessage?: string;
};

export type TopicMergedMaterial = {
  topic: string;
  confirmedFacts: string[];
  creatorProblems: string[];
  controversies: string[];
  contentGaps: string[];
  usableArguments: string[];
  riskBoundaries: string[];
  sourceSummary: Array<{
    materialId: string;
    title: string;
    sourceUrl?: string;
    confidence: "high" | "medium" | "low";
  }>;
};

export type ContentStudioTopicStepType =
  | "topic_planning"
  | "research_plan"
  | "material_search"
  | "material_merge"
  | "draft_generation"
  | "review_round"
  | "rewrite_round"
  | "final_review"
  | "completed";

export type ContentStudioTopicStepStatus = "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";

export type ContentStudioTopicStep = {
  stepKey: string;
  stepName: string;
  stepType: ContentStudioTopicStepType;
  status: ContentStudioTopicStepStatus;
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
  attemptCount: number;
  startedAt?: string;
  finishedAt?: string;
};

export type MaterialSourceType = "text" | "url" | "word";
export type MaterialExtractMethod = "manual" | "browser_extract" | "llmweb_body_extract" | "llmweb_url_extract";

export type MaterialRewriteInput = {
  topic?: string;
  platform: "公众号" | "今日头条" | "小红书" | "知乎" | "CSDN";
  articleType: "观点文" | "科普文" | "热点解读" | "干货文" | "种草文";
  targetReader?: string;
  writingStyle?: string;
  wordRange?: string;
  generateTitleCandidates?: boolean;
  generateCoverText?: boolean;
  generateImagePlan?: boolean;
  topicReviewRounds?: number;
  articleReviewRounds?: number;
  collectImagesFromUrl?: boolean;
  maxSourceCount?: number;
  sources: Array<{
    sourceId: string;
    type: MaterialSourceType;
    title?: string;
    url?: string;
    body: string;
    extractMethod?: MaterialExtractMethod;
    images?: ContentStudioImageAsset[];
  }>;
};

export type ContentStudioMaterialPack = {
  topic?: string;
  sources: Array<{
    sourceId: string;
    type: MaterialSourceType;
    title?: string;
    url?: string;
    body: string;
    extractMethod?: MaterialExtractMethod;
    images: ContentStudioImageAsset[];
  }>;
};

export type ContentStudioImagePlanType = "source_image" | "ai_generated" | "infographic" | "none";

export type ContentStudioImagePlan = {
  type: ContentStudioImagePlanType;
  prompt?: string;
  caption?: string;
};

export type ContentStudioParagraphImagePlanUpdate = {
  paragraphId: string;
  imagePlan?: ContentStudioImagePlan;
};

export type ContentStudioImageAsset = {
  assetId: string;
  sourceType: "local_upload" | "generated" | "source";
  fileName: string;
  localPath: string;
  createdAt: string;
  caption?: string;
  sourceRef?: string;
};

export type ContentStudioParagraphImageBinding = {
  paragraphId: string;
  assetId: string;
  caption?: string;
};

export type ContentStudioGenerateImageOptions = {
  paragraphId?: string;
  prompt: string;
  bindAfterGenerate?: boolean;
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
  name:
    | "plan"
    | "review"
    | "rewrite"
    | "final_review"
    | "source_analysis"
    | "topic_generate"
    | "topic_review"
    | "topic_rewrite"
    | "topic_final_decision"
    | "article_draft"
    | "article_review"
    | "article_rewrite"
    | "article_final_review";
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
  materialPack?: ContentStudioMaterialPack;
  debateSteps: ContentStudioDebateStep[];
  result?: ContentStudioArticle;
  finalReview?: {
    verdict: "pass" | "revise";
    publishable?: boolean;
    originalityScore?: number;
    viralPotentialScore?: number;
    similarityRisk?: "low" | "medium" | "high";
    riskNotes?: string[];
  };
  imageAssets: ContentStudioImageAsset[];
  imageBindings?: ContentStudioParagraphImageBinding[];
  currentStep?: string;
  topicSteps?: ContentStudioTopicStep[];
  selectedTopic?: TopicSelectedTopic;
  researchPlan?: TopicResearchPlanItem[];
  researchMaterials?: TopicResearchMaterialCard[];
  mergedMaterial?: TopicMergedMaterial;
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

export type ContentStudioMaterialProgressStatus =
  | "queued"
  | "collecting_sources"
  | "running_step"
  | "parsing_result"
  | "completed"
  | "failed";

export type ContentStudioMaterialProgress = {
  taskId: string;
  tab: "material";
  status: ContentStudioMaterialProgressStatus;
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
