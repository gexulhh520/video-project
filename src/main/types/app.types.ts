export type TranscriptSegment = {
  segmentId: string;
  start: number;
  end: number;
  text: string;
};

export type TranscriptResult = {
  provider: "doubao";
  fullText: string;
  segments: TranscriptSegment[];
};

export type SourceTimeRange = {
  start: number;
  end: number;
  reason?: string;
};

export type ArticleSection = {
  sectionId: string;
  paragraph: string;
  sourceSegmentIds?: string[];
  sourceTimeRanges: SourceTimeRange[];
};

export type ImageEditMeta = {
  originalImagePath: string;
  editedImagePath: string;
  editedAt: string;
  effect: "mosaic";
};

export type ContentBlock =
  | {
      type: "paragraph";
      blockId: string;
      sectionId: string;
      text: string;
      edited?: boolean;
    }
  | {
      type: "image";
      blockId: string;
      sectionId: string;
      imagePath: string;
      time: number;
      caption?: string;
      sourceType?: "auto" | "upload" | "video-frame" | "video-gif";
      sourceTimeRange?: SourceTimeRange;
      editMeta?: ImageEditMeta;
    };

export type PostDraft = {
  draftId: string;
  title: string;
  fullText: string;
  sections: ArticleSection[];
  contentBlocks: ContentBlock[];
  createdAt: string;
  updatedAt?: string;
  sourceVideoPath?: string;
};

export type DraftSummary = {
  draftId: string;
  title: string;
  createdAt: string;
  sectionCount: number;
  coverImagePath?: string;
};

export type FrameAssetMode = "image" | "gif";

export type FramePreviewResult = {
  imageDataUrl: string;
  timeSeconds: number;
  mode: FrameAssetMode;
  durationSeconds?: number;
  sizeBytes?: number;
  width?: number;
};

export type ReplaceFrameAssetOptions = {
  mode: FrameAssetMode;
  timeSeconds: number;
  durationSeconds?: number;
};

export type SaveEditedFrameOptions = {
  draftId: string;
  blockId: string;
  sourceImagePath: string;
  imageBase64: string;
  time: number;
};

export type GeneratePostOptions = {
  frameOffsetSeconds: number;
  userPrompt?: string;
};

export type RewriteParagraphOptions = {
  paragraph: string;
};

export type RewriteDraftOptions = {
  draft: PostDraft;
  userPrompt: string;
  rewriteTitle?: boolean;
};

export type RewriteDraftIterativeOptions = RewriteDraftOptions;

export type RewriteDraftResult = {
  title: string;
  sections: Array<{
    sectionId: string;
    paragraph: string;
  }>;
};

export type AppSettings = {
  workspaceDir: string;
  globalRuntime?: GlobalRuntimeSettings;
  videoToPost?: VideoToPostSettings;
};

export type GlobalRuntimeSettings = {
  llmBaseUrl: string;
  doubaoAsrBaseUrl: string;
  doubaoAsrResourceId: string;
  doubaoUid: string;
};

export type VideoToPostSettings = {
  doubaoAsrApiKey: string;
  llmApiKey: string;
  llmModel: string;
  runtime?: WebToPostRuntime;
  openCliCommand?: string;
  openCliProfile?: string;
  openCliProvider?: OpenCliProvider;
  openCliPollIntervalMs?: number;
  openCliTimeoutMs?: number;
};

export type ArticleRewriteSettings = {
  llmApiKey: string;
  llmModel: string;
  runtime?: WebToPostRuntime;
  openCliCommand?: string;
  openCliProfile?: string;
  openCliProvider?: OpenCliProvider;
  openCliPollIntervalMs?: number;
  openCliTimeoutMs?: number;
};

export type WebToPostRuntime = "bb-browser" | "opencli";

export type OpenCliProvider = "chatgpt" | "gemini" | "claude" | "grok" | "doubao" | "yuanbao";

export type WebToPostSettings = {
  llmApiKey: string;
  llmModel: string;
  bbBrowserCommand: string;
  bbBrowserArgs: string;
  bbBrowserMcpCommand: string;
  bbBrowserMcpArgs: string;
  runtime?: WebToPostRuntime;
  openCliCommand?: string;
  openCliProfile?: string;
  openCliProvider?: OpenCliProvider;
  openCliPollIntervalMs?: number;
  openCliTimeoutMs?: number;
};

export type VideoToPostConfigStatus = {
  ready: boolean;
  hasDoubaoAsrApiKey: boolean;
  hasLlmApiKey: boolean;
  resolvedLlmModel: string;
  runtime?: WebToPostRuntime;
  hasOpenCliCommand?: boolean;
  hasOpenCliProfile?: boolean;
  openCliProfile?: string;
  openCliProvider?: OpenCliProvider;
  missingItems: string[];
};

export type WebToPostConfigStatus = {
  ready: boolean;
  hasLlmApiKey: boolean;
  hasBbBrowserCommand: boolean;
  resolvedLlmModel: string;
  runtime?: WebToPostRuntime;
  hasOpenCliCommand?: boolean;
  hasOpenCliProfile?: boolean;
  openCliProfile?: string;
  openCliProvider?: OpenCliProvider;
  missingItems: string[];
};

export type ArticleRewriteConfigStatus = {
  ready: boolean;
  hasLlmApiKey: boolean;
  resolvedLlmModel: string;
  runtime?: WebToPostRuntime;
  hasOpenCliCommand?: boolean;
  hasOpenCliProfile?: boolean;
  openCliProfile?: string;
  openCliProvider?: OpenCliProvider;
  missingItems: string[];
};

export type TaskStatus =
  | "idle"
  | "copying_video"
  | "extracting_audio"
  | "splitting_audio"
  | "transcribing"
  | "generating_sections"
  | "extracting_frames"
  | "building_post"
  | "completed"
  | "failed";

export type TaskProgress = {
  taskId: string;
  status: TaskStatus;
  progress: number;
  message: string;
};

export type BrowserRuntimeHealthStatus = {
  healthy: boolean;
  daemonRunning: boolean;
  cdpConnected: boolean;
  checkedAt: string;
  message: string;
  rawOutput?: string;
};

export type OpenCliProfileStatus = {
  id: string;
  status: "connected" | "disconnected" | "unknown";
  version?: string;
};

export type OpenCliRuntimeHealthStatus = {
  healthy: boolean;
  checkedAt: string;
  message: string;
  rawOutput?: string;
  profiles: OpenCliProfileStatus[];
  selectedProfile?: string;
};

export type OpenCliProviderStatus = {
  provider: OpenCliProvider;
  profile?: string;
  ready: boolean;
  message: string;
  rawOutput?: string;
};

export type WebTaskStatus =
  | "idle"
  | "checking_runtime_health"
  | "resetting_runtime"
  | "opening_page"
  | "waiting_page_ready"
  | "fetching_title"
  | "capturing_snapshot"
  | "extracting_article"
  | "awaiting_user_confirmation"
  | "collecting_images"
  | "closing_tab"
  | "ready_for_next_url"
  | "rewriting"
  | "completed"
  | "failed";

export type WebTaskProgress = {
  taskId: string;
  recordId?: string;
  status: WebTaskStatus;
  progress: number;
  message: string;
};

export type WebImageAsset = {
  assetId: string;
  sourceUrl: string;
  localPath?: string;
  originRecordId: string;
  selected: boolean;
  downloadedAt?: string;
  failedReason?: string;
};

export type WebCrawlRecord = {
  recordId: string;
  sourceUrl: string;
  tabId?: string;
  title: string;
  snapshot: string;
  extractedBody: string;
  userEditedBody: string;
  extractPrompt: string;
  status: WebTaskStatus;
  lastRunAt?: string;
  rerunCount: number;
  failureReason?: string;
  imageAssetIds: string[];
};

export type WebRewriteResult = {
  rewriteId?: string;
  title: string;
  paragraphs: string[];
  contentBlocks: ContentBlock[];
  fullText: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  sourceRecordIds: string[];
};

export type WebCrawlTask = {
  taskId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: WebTaskStatus;
  currentRecordId?: string;
  records: WebCrawlRecord[];
  imageAssets: WebImageAsset[];
  rewritePrompt: string;
  rewriteResult?: WebRewriteResult;
  rewriteHistory?: WebRewriteResult[];
  runtimeHealth?: BrowserRuntimeHealthStatus;
};

export type WebTaskSummary = {
  taskId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  recordCount: number;
  status: WebTaskStatus;
};

export type WebCrawlStartOptions = {
  url: string;
  recordId?: string;
};

export type ConfirmWebRecordBodyOptions = {
  recordId: string;
  body: string;
};

export type RetryExtractWebRecordOptions = {
  recordId: string;
  prompt: string;
};

export type RewriteWebTaskOptions = {
  prompt: string;
  recordIds: string[];
};

export type IterativeRewriteWebTaskOptions = {
  prompt: string;
};

export type SaveWebRewriteResultOptions = {
  rewriteResult: WebRewriteResult;
};

export type DeleteWebRecordOptions = {
  recordId: string;
};

export type DeleteWebRewriteHistoryOptions = {
  rewriteId: string;
};

export type WebTaskAutoExportResult = {
  outputDir: string;
  wordPath: string;
  imagesDirPath: string;
};

export type LicensePayload = {
  licenseId: string;
  machineId: string;
  customer?: string;
  issuedAt?: string;
  expiresAt?: string;
  durationDays?: number;
  features?: string[];
};

export type LicenseStatus = {
  authorized: boolean;
  machineId: string;
  enabled: boolean;
  reason?: string;
  license?: LicensePayload;
};

export type LlmSectionsResult = {
  title: string;
  sections: ArticleSection[];
};

export type DesktopApi = {
  selectVideo: () => Promise<string | null>;
  selectWord: () => Promise<string | null>;
  selectImage: () => Promise<string | null>;
  selectDirectory: () => Promise<string | null>;
  generatePost: (videoPath: string, options: GeneratePostOptions) => Promise<PostDraft>;
  importArticleRewriteWordDraft: (wordPath: string) => Promise<PostDraft>;
  listArticleRewriteDrafts: () => Promise<DraftSummary[]>;
  getArticleRewriteDraftById: (draftId: string) => Promise<PostDraft>;
  saveArticleRewriteDraft: (draft: PostDraft) => Promise<PostDraft>;
  exportArticleRewriteDraftToWord: (draft: PostDraft) => Promise<string | null>;
  exportArticleRewriteDraftImagesArchive: (draft: PostDraft) => Promise<string | null>;
  replaceArticleRewriteDraftImage: (draftId: string, blockId: string, sourceImagePath: string) => Promise<PostDraft>;
  rewriteArticleRewriteParagraph: (options: RewriteParagraphOptions) => Promise<string>;
  rewriteArticleRewriteDraft: (options: RewriteDraftOptions) => Promise<PostDraft>;
  rewriteArticleRewriteDraftIterative: (options: RewriteDraftIterativeOptions) => Promise<PostDraft>;
  listDrafts: () => Promise<DraftSummary[]>;
  getDraftById: (draftId: string) => Promise<PostDraft>;
  saveDraft: (draft: PostDraft) => Promise<PostDraft>;
  exportDraftToWord: (draft: PostDraft) => Promise<string | null>;
  exportDraftImagesArchive: (draft: PostDraft) => Promise<string | null>;
  getAppSettings: () => Promise<AppSettings>;
  saveAppSettings: (settings: AppSettings) => Promise<AppSettings>;
  getVideoToPostSettings: () => Promise<VideoToPostSettings>;
  saveVideoToPostSettings: (settings: VideoToPostSettings) => Promise<VideoToPostSettings>;
  getVideoToPostConfigStatus: () => Promise<VideoToPostConfigStatus>;
  getArticleRewriteSettings: () => Promise<ArticleRewriteSettings>;
  saveArticleRewriteSettings: (settings: ArticleRewriteSettings) => Promise<ArticleRewriteSettings>;
  getArticleRewriteConfigStatus: () => Promise<ArticleRewriteConfigStatus>;
  getWebToPostSettings: () => Promise<WebToPostSettings>;
  saveWebToPostSettings: (settings: WebToPostSettings) => Promise<WebToPostSettings>;
  getWebToPostConfigStatus: () => Promise<WebToPostConfigStatus>;
  checkOpenCliHealth: () => Promise<OpenCliRuntimeHealthStatus>;
  repairOpenCliRuntime: () => Promise<OpenCliRuntimeHealthStatus>;
  openOpenCliProviderLoginPage: (provider: OpenCliProvider, profile?: string) => Promise<void>;
  testOpenCliProvider: (provider: OpenCliProvider, profile?: string) => Promise<OpenCliProviderStatus>;
  replaceDraftImage: (draftId: string, blockId: string, sourceImagePath: string) => Promise<PostDraft>;
  previewDraftFrame: (draftId: string, options: ReplaceFrameAssetOptions) => Promise<FramePreviewResult>;
  replaceDraftImageFromFrame: (draftId: string, blockId: string, options: ReplaceFrameAssetOptions) => Promise<PostDraft>;
  saveEditedFrame: (options: SaveEditedFrameOptions) => Promise<{ imagePath: string; updatedDraft: PostDraft }>;
  rewriteParagraph: (options: RewriteParagraphOptions) => Promise<string>;
  rewriteDraft: (options: RewriteDraftOptions) => Promise<PostDraft>;
  rewriteDraftIterative: (options: RewriteDraftIterativeOptions) => Promise<PostDraft>;
  listWebTasks: () => Promise<WebTaskSummary[]>;
  getWebTaskById: (taskId: string) => Promise<WebCrawlTask>;
  createWebTask: (title?: string) => Promise<WebCrawlTask>;
  startWebCrawl: (taskId: string, options: WebCrawlStartOptions) => Promise<WebCrawlTask>;
  saveWebRecordBody: (taskId: string, options: ConfirmWebRecordBodyOptions) => Promise<WebCrawlTask>;
  retryWebRecordExtract: (taskId: string, options: RetryExtractWebRecordOptions) => Promise<WebCrawlTask>;
  collectWebRecordImages: (taskId: string, recordId: string) => Promise<WebCrawlTask>;
  rewriteWebTask: (taskId: string, options: RewriteWebTaskOptions) => Promise<WebCrawlTask>;
  rewriteWebTaskIterative: (taskId: string, options: IterativeRewriteWebTaskOptions) => Promise<WebCrawlTask>;
  saveWebRewriteResult: (taskId: string, options: SaveWebRewriteResultOptions) => Promise<WebCrawlTask>;
  deleteWebRewriteHistory: (taskId: string, options: DeleteWebRewriteHistoryOptions) => Promise<WebCrawlTask>;
  toggleWebImageSelection: (taskId: string, assetId: string, selected: boolean) => Promise<WebCrawlTask>;
  deleteWebRecord: (taskId: string, options: DeleteWebRecordOptions) => Promise<WebCrawlTask>;
  deleteWebTask: (taskId: string) => Promise<void>;
  renameWebTask: (taskId: string, title: string) => Promise<WebCrawlTask>;
  exportWebTaskToWord: (taskId: string) => Promise<string | null>;
  autoExportWebTaskBundle: (taskId: string) => Promise<WebTaskAutoExportResult>;
  getMachineId: () => Promise<string>;
  checkLicense: () => Promise<LicenseStatus>;
  activateLicense: (licenseKey: string) => Promise<LicenseStatus>;
  readImageAsDataUrl: (imagePath: string) => Promise<string>;
  onTaskProgress: (callback: (progress: TaskProgress) => void) => () => void;
  onWebTaskProgress: (callback: (progress: WebTaskProgress) => void) => () => void;
};
