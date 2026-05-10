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

export type VideoToPostConfigStatus = {
  ready: boolean;
  hasDoubaoAsrApiKey: boolean;
  hasLlmApiKey: boolean;
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
  replaceDraftImage: (draftId: string, blockId: string, sourceImagePath: string) => Promise<PostDraft>;
  previewDraftFrame: (draftId: string, options: ReplaceFrameAssetOptions) => Promise<FramePreviewResult>;
  replaceDraftImageFromFrame: (draftId: string, blockId: string, options: ReplaceFrameAssetOptions) => Promise<PostDraft>;
  rewriteParagraph: (options: RewriteParagraphOptions) => Promise<string>;
  readImageAsDataUrl: (imagePath: string) => Promise<string>;
  onTaskProgress: (callback: (progress: TaskProgress) => void) => () => void;
};
