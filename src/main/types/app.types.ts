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

export type GeneratePostOptions = {
  frameOffsetSeconds: number;
};

export type RewriteParagraphOptions = {
  paragraph: string;
};

export type AppSettings = {
  workspaceDir: string;
  videoToPost?: VideoToPostSettings;
};

export type VideoToPostSettings = {
  doubaoAsrApiKey: string;
  llmApiKey: string;
  llmModel: string;
};

export type WebToPostSettings = {
  llmApiKey: string;
  llmModel: string;
  bbBrowserCommand: string;
  bbBrowserArgs: string;
  bbBrowserMcpCommand: string;
  bbBrowserMcpArgs: string;
};

export type VideoToPostConfigStatus = {
  ready: boolean;
  hasDoubaoAsrApiKey: boolean;
  hasLlmApiKey: boolean;
  resolvedLlmModel: string;
  missingItems: string[];
};

export type WebToPostConfigStatus = {
  ready: boolean;
  hasLlmApiKey: boolean;
  hasBbBrowserCommand: boolean;
  resolvedLlmModel: string;
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

export type SaveWebRewriteResultOptions = {
  rewriteResult: WebRewriteResult;
};

export type DeleteWebRecordOptions = {
  recordId: string;
};

export type LlmSectionsResult = {
  title: string;
  sections: ArticleSection[];
};

export type DesktopApi = {
  selectVideo: () => Promise<string | null>;
  selectImage: () => Promise<string | null>;
  selectDirectory: () => Promise<string | null>;
  generatePost: (videoPath: string, options: GeneratePostOptions) => Promise<PostDraft>;
  listDrafts: () => Promise<DraftSummary[]>;
  getDraftById: (draftId: string) => Promise<PostDraft>;
  saveDraft: (draft: PostDraft) => Promise<PostDraft>;
  exportDraftToWord: (draft: PostDraft) => Promise<string | null>;
  getAppSettings: () => Promise<AppSettings>;
  saveAppSettings: (settings: AppSettings) => Promise<AppSettings>;
  getVideoToPostSettings: () => Promise<VideoToPostSettings>;
  saveVideoToPostSettings: (settings: VideoToPostSettings) => Promise<VideoToPostSettings>;
  getVideoToPostConfigStatus: () => Promise<VideoToPostConfigStatus>;
  getWebToPostSettings: () => Promise<WebToPostSettings>;
  saveWebToPostSettings: (settings: WebToPostSettings) => Promise<WebToPostSettings>;
  getWebToPostConfigStatus: () => Promise<WebToPostConfigStatus>;
  replaceDraftImage: (draftId: string, blockId: string, sourceImagePath: string) => Promise<PostDraft>;
  previewDraftFrame: (draftId: string, options: ReplaceFrameAssetOptions) => Promise<FramePreviewResult>;
  replaceDraftImageFromFrame: (draftId: string, blockId: string, options: ReplaceFrameAssetOptions) => Promise<PostDraft>;
  rewriteParagraph: (options: RewriteParagraphOptions) => Promise<string>;
  listWebTasks: () => Promise<WebTaskSummary[]>;
  getWebTaskById: (taskId: string) => Promise<WebCrawlTask>;
  createWebTask: (title?: string) => Promise<WebCrawlTask>;
  startWebCrawl: (taskId: string, options: WebCrawlStartOptions) => Promise<WebCrawlTask>;
  saveWebRecordBody: (taskId: string, options: ConfirmWebRecordBodyOptions) => Promise<WebCrawlTask>;
  retryWebRecordExtract: (taskId: string, options: RetryExtractWebRecordOptions) => Promise<WebCrawlTask>;
  collectWebRecordImages: (taskId: string, recordId: string) => Promise<WebCrawlTask>;
  rewriteWebTask: (taskId: string, options: RewriteWebTaskOptions) => Promise<WebCrawlTask>;
  saveWebRewriteResult: (taskId: string, options: SaveWebRewriteResultOptions) => Promise<WebCrawlTask>;
  toggleWebImageSelection: (taskId: string, assetId: string, selected: boolean) => Promise<WebCrawlTask>;
  deleteWebRecord: (taskId: string, options: DeleteWebRecordOptions) => Promise<WebCrawlTask>;
  exportWebTaskToWord: (taskId: string) => Promise<string | null>;
  readImageAsDataUrl: (imagePath: string) => Promise<string>;
  onTaskProgress: (callback: (progress: TaskProgress) => void) => () => void;
  onWebTaskProgress: (callback: (progress: WebTaskProgress) => void) => () => void;
};
