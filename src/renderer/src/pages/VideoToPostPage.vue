<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { DraftSummary, FramePreviewResult, PostDraft, TaskProgress } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";
import DraftEditor from "../components/DraftEditor.vue";
import DraftShelf from "../components/DraftShelf.vue";
import FramePickerModal from "../components/FramePickerModal.vue";
import PostPreview from "../components/PostPreview.vue";
import TaskProgressBar from "../components/TaskProgress.vue";
import VideoImporter from "../components/VideoImporter.vue";

const router = useRouter();
const selectedVideoPath = ref<string | null>(null);
const draft = ref<PostDraft | null>(null);
const drafts = ref<DraftSummary[]>([]);
const activeDraftId = ref<string | null>(null);
const loadingDrafts = ref(false);
const busy = ref(false);
const savingDraft = ref(false);
const replacingImageBlockId = ref<string | null>(null);
const editorOpen = ref(false);
const immersiveEditor = ref(false);
const framePickerOpen = ref(false);
const framePickerBlockId = ref<string | null>(null);
const framePickerSectionLabel = ref("");
const framePickerMinSeconds = ref(0);
const framePickerMaxSeconds = ref(0);
const framePickerTimeSeconds = ref(0);
const framePickerPreview = ref<FramePreviewResult | null>(null);
const framePreviewLoading = ref(false);
const frameReplacing = ref(false);
const progress = ref<TaskProgress>({
  taskId: "idle",
  status: "idle",
  progress: 0,
  message: "等待选择视频"
});
const errorMessage = ref("");

let unsubscribe: (() => void) | null = null;

const pageStyle = computed(() => ({
  gridTemplateColumns: "380px minmax(0, 1fr)"
}));

onMounted(() => {
  unsubscribe = desktopApi.onTaskProgress((nextProgress) => {
    progress.value = nextProgress;
  });

  void refreshDrafts(true);
});

onBeforeUnmount(() => {
  unsubscribe?.();
});

async function handleSelectVideo(): Promise<void> {
  errorMessage.value = "";
  selectedVideoPath.value = await desktopApi.selectVideo();
}

async function handleGenerate(): Promise<void> {
  if (!selectedVideoPath.value || busy.value) {
    return;
  }

  busy.value = true;
  errorMessage.value = "";
  draft.value = null;
  progress.value = {
    taskId: "queued",
    status: "copying_video",
    progress: 2,
    message: "任务已开始，正在准备"
  };

  try {
    draft.value = await desktopApi.generatePost(selectedVideoPath.value);
    activeDraftId.value = draft.value.draftId;
    editorOpen.value = false;
    immersiveEditor.value = false;
    await refreshDrafts();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "生成失败";
    progress.value = {
      taskId: progress.value.taskId,
      status: "failed",
      progress: 100,
      message: "生成失败"
    };
  } finally {
    busy.value = false;
  }
}

async function refreshDrafts(openLatest = false): Promise<void> {
  loadingDrafts.value = true;

  try {
    drafts.value = await desktopApi.listDrafts();
    if (openLatest && drafts.value.length > 0) {
      await openDraft(drafts.value[0].draftId);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "读取草稿失败";
  } finally {
    loadingDrafts.value = false;
  }
}

async function openDraft(draftId: string): Promise<void> {
  errorMessage.value = "";
  draft.value = await desktopApi.getDraftById(draftId);
  activeDraftId.value = draftId;
  editorOpen.value = false;
  immersiveEditor.value = false;
  progress.value = {
    taskId: draftId,
    status: "completed",
    progress: 100,
    message: "已从草稿箱加载历史结果"
  };
}

function handleDraftChange(nextDraft: PostDraft): void {
  draft.value = nextDraft;
}

async function saveDraftEdits(): Promise<void> {
  if (!draft.value || savingDraft.value) {
    return;
  }

  savingDraft.value = true;
  errorMessage.value = "";

  try {
    draft.value = await desktopApi.saveDraft(draft.value);
    activeDraftId.value = draft.value.draftId;
    await refreshDrafts();
    progress.value = {
      taskId: draft.value.draftId,
      status: "completed",
      progress: 100,
      message: "草稿编辑已保存"
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存草稿失败";
  } finally {
    savingDraft.value = false;
  }
}

async function replaceDraftImage(blockId?: string): Promise<void> {
  if (!draft.value || !blockId) {
    return;
  }

  const selectedImagePath = await desktopApi.selectImage();
  if (!selectedImagePath) {
    return;
  }

  replacingImageBlockId.value = blockId;
  errorMessage.value = "";

  try {
    draft.value = await desktopApi.replaceDraftImage(draft.value.draftId, blockId, selectedImagePath);
    activeDraftId.value = draft.value.draftId;
    await refreshDrafts();
    progress.value = {
      taskId: draft.value.draftId,
      status: "completed",
      progress: 100,
      message: "图片已替换并保存到草稿"
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "替换图片失败";
  } finally {
    replacingImageBlockId.value = null;
  }
}

async function openFramePicker(blockId?: string): Promise<void> {
  if (!draft.value || !blockId) {
    return;
  }

  const imageBlock = draft.value.contentBlocks.find(
    (block): block is Extract<PostDraft["contentBlocks"][number], { type: "image" }> => block.type === "image" && block.blockId === blockId
  );

  if (!imageBlock) {
    errorMessage.value = "未找到对应图片块。";
    return;
  }

  if (!draft.value.sourceVideoPath) {
    errorMessage.value = "当前草稿缺少原视频路径，暂时无法从视频重新选帧。";
    return;
  }

  const range =
    imageBlock.sourceTimeRange ??
    draft.value.sections.find((section) => section.sectionId === imageBlock.sectionId)?.sourceTimeRanges[0];
  const baseStart = range?.start ?? Math.max(imageBlock.time - 5, 0);
  const baseEnd = range?.end ?? imageBlock.time + 5;

  framePickerMinSeconds.value = Math.max(baseStart - 5, 0);
  framePickerMaxSeconds.value = Math.max(framePickerMinSeconds.value + 1, baseEnd + 5);
  framePickerTimeSeconds.value = Math.min(
    framePickerMaxSeconds.value,
    Math.max(framePickerMinSeconds.value, imageBlock.time ?? (baseStart + baseEnd) / 2)
  );
  framePickerBlockId.value = blockId;
  framePickerSectionLabel.value = `${imageBlock.sectionId} · 建议在 ${framePickerMinSeconds.value.toFixed(1)}s - ${framePickerMaxSeconds.value.toFixed(1)}s 之间挑帧`;
  framePickerPreview.value = null;
  framePickerOpen.value = true;
  errorMessage.value = "";
  await refreshFramePreview(framePickerTimeSeconds.value);
}

function closeFramePicker(): void {
  framePickerOpen.value = false;
  framePickerBlockId.value = null;
  framePickerPreview.value = null;
}

async function refreshFramePreview(timeSeconds: number): Promise<void> {
  if (!draft.value) {
    return;
  }

  framePickerTimeSeconds.value = timeSeconds;
  framePreviewLoading.value = true;

  try {
    framePickerPreview.value = await desktopApi.previewDraftFrame(draft.value.draftId, timeSeconds);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "抽取预览帧失败";
  } finally {
    framePreviewLoading.value = false;
  }
}

async function confirmFrameReplacement(): Promise<void> {
  if (!draft.value || !framePickerBlockId.value || frameReplacing.value) {
    return;
  }

  frameReplacing.value = true;
  errorMessage.value = "";

  try {
    draft.value = await desktopApi.replaceDraftImageFromFrame(
      draft.value.draftId,
      framePickerBlockId.value,
      framePickerTimeSeconds.value
    );
    activeDraftId.value = draft.value.draftId;
    await refreshDrafts();
    closeFramePicker();
    progress.value = {
      taskId: draft.value.draftId,
      status: "completed",
      progress: 100,
      message: "已从原视频重新选帧并替换图片"
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "视频选帧替换失败";
  } finally {
    frameReplacing.value = false;
  }
}

function toggleEditor(): void {
  if (!draft.value) {
    return;
  }

  editorOpen.value = !editorOpen.value;
  if (!editorOpen.value) {
    immersiveEditor.value = false;
  }
}

function toggleImmersiveEditor(): void {
  if (!draft.value || !editorOpen.value) {
    return;
  }

  immersiveEditor.value = !immersiveEditor.value;
}
</script>

<template>
  <section class="video-page" :style="pageStyle">
    <aside class="sidebar">
      <button class="back-btn" @click="router.push('/')">返回工具箱</button>
      <VideoImporter :selected-video-path="selectedVideoPath" :busy="busy" @select="handleSelectVideo" @generate="handleGenerate" />
      <DraftShelf
        :drafts="drafts"
        :active-draft-id="activeDraftId"
        :loading="loadingDrafts"
        @open="openDraft"
        @refresh="refreshDrafts"
      />

      <div class="mode-card">
        <span class="mode-label">当前视图</span>
        <strong>{{ editorOpen ? "编辑模式" : "预览模式" }}</strong>
        <div class="mode-actions">
          <button v-if="editorOpen" class="secondary-toggle-btn" :disabled="!draft" @click="toggleImmersiveEditor">
            {{ immersiveEditor ? "退出沉浸" : "沉浸编辑" }}
          </button>
          <button class="editor-toggle-btn" :disabled="!draft" @click="toggleEditor">
            {{ editorOpen ? "返回预览" : "进入编辑" }}
          </button>
        </div>
      </div>

      <div v-if="errorMessage" class="error-card">
        <span class="label">错误信息</span>
        <strong>{{ errorMessage }}</strong>
      </div>
    </aside>

    <div v-if="!editorOpen" class="preview-column">
      <PostPreview :draft="draft" />
      <TaskProgressBar :progress="progress" />
    </div>

    <div v-else class="editor-column" :class="{ immersive: immersiveEditor }">
      <div class="editor-toolbar">
        <div>
          <span class="toolbar-label">编辑工作台</span>
          <strong>修改标题、段落、图片</strong>
        </div>
      </div>
      <DraftEditor
        :draft="draft"
        :saving="savingDraft"
        :replacing-image-block-id="replacingImageBlockId"
        @change="handleDraftChange"
        @save="saveDraftEdits"
        @replace-image="replaceDraftImage"
        @open-frame-picker="openFramePicker"
      />
    </div>

    <FramePickerModal
      :open="framePickerOpen"
      :loading="framePreviewLoading"
      :saving="frameReplacing"
      :time-seconds="framePickerTimeSeconds"
      :min-seconds="framePickerMinSeconds"
      :max-seconds="framePickerMaxSeconds"
      :preview="framePickerPreview"
      :section-label="framePickerSectionLabel"
      @close="closeFramePicker"
      @change-time="refreshFramePreview"
      @confirm="confirmFrameReplacement"
    />
  </section>
</template>

<style scoped>
.video-page {
  height: 100%;
  display: grid;
  gap: 24px;
  padding: 24px 28px 28px;
  align-items: stretch;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  overflow: auto;
}

.back-btn {
  min-height: 46px;
  border-radius: 14px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.mode-card,
.error-card {
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
}

.mode-label,
.label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #92abd1;
}

.mode-card strong {
  display: block;
  font-size: 14px;
  color: #eef5ff;
  margin-bottom: 12px;
}

.mode-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.preview-column {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 18px;
  overflow: hidden;
}

.editor-column {
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 18px;
  overflow: hidden;
}

.editor-column.immersive {
  width: 100%;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
}

.toolbar-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: #92abd1;
}

.editor-toolbar strong {
  color: #eef5ff;
}

.editor-toggle-btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: linear-gradient(135deg, #6bc3ff, #3f7df7);
  color: #08111f;
  font-weight: 600;
  cursor: pointer;
}

.secondary-toggle-btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
  font-weight: 600;
  cursor: pointer;
}

.editor-toggle-btn:disabled,
.secondary-toggle-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.error-card {
  color: #ffd9d9;
  border-color: rgba(255, 106, 106, 0.22);
  background: rgba(255, 106, 106, 0.08);
}

@media (max-width: 1180px) {
  .video-page {
    grid-template-columns: 1fr !important;
  }
}
</style>
