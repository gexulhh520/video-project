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
    }
  | {
      type: "image";
      blockId: string;
      sectionId: string;
      imagePath: string;
      time: number;
      caption?: string;
    };

export type PostDraft = {
  draftId: string;
  title: string;
  fullText: string;
  sections: ArticleSection[];
  contentBlocks: ContentBlock[];
  createdAt: string;
};

export type DraftSummary = {
  draftId: string;
  title: string;
  createdAt: string;
  sectionCount: number;
  coverImagePath?: string;
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
  generatePost: (videoPath: string) => Promise<PostDraft>;
  listDrafts: () => Promise<DraftSummary[]>;
  getDraftById: (draftId: string) => Promise<PostDraft>;
  readImageAsDataUrl: (imagePath: string) => Promise<string>;
  onTaskProgress: (callback: (progress: TaskProgress) => void) => () => void;
};
