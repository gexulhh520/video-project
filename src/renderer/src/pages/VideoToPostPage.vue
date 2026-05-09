<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { DraftSummary, PostDraft, TaskProgress } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";
import DraftShelf from "../components/DraftShelf.vue";
import DraftEditor from "../components/DraftEditor.vue";
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
const progress = ref<TaskProgress>({
  taskId: "idle",
  status: "idle",
  progress: 0,
  message: "等待选择视频"
});
const errorMessage = ref("");

let unsubscribe: (() => void) | null = null;

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

function toggleEditor(): void {
  if (!draft.value) {
    return;
  }

  editorOpen.value = !editorOpen.value;
}
</script>

<template>
  <section class="video-page" :class="{ 'editor-open': editorOpen }">
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

      <div v-if="errorMessage" class="error-card">
        <span class="label">错误信息</span>
        <strong>{{ errorMessage }}</strong>
      </div>
    </aside>

    <div class="preview-column">
      <div class="preview-toolbar">
        <div class="toolbar-copy">
          <span class="toolbar-label">当前视图</span>
          <strong>{{ editorOpen ? "编辑模式" : "预览模式" }}</strong>
        </div>
        <button class="editor-toggle-btn" :disabled="!draft" @click="toggleEditor">
          {{ editorOpen ? "关闭编辑" : "进入编辑" }}
        </button>
      </div>
      <PostPreview :draft="draft" />
      <TaskProgressBar :progress="progress" />
    </div>

    <div v-if="editorOpen" class="editor-column">
      <DraftEditor
        :draft="draft"
        :saving="savingDraft"
        :replacing-image-block-id="replacingImageBlockId"
        @change="handleDraftChange"
        @save="saveDraftEdits"
        @replace-image="replaceDraftImage"
      />
    </div>
  </section>
</template>

<style scoped>
.video-page {
  height: 100%;
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 24px;
  padding: 24px 28px 28px;
}

.video-page.editor-open {
  grid-template-columns: 380px minmax(0, 1fr) 380px;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
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

.preview-column {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 18px;
}

.editor-column {
  min-height: 0;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
}

.toolbar-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toolbar-label {
  font-size: 12px;
  color: #92abd1;
}

.toolbar-copy strong {
  font-size: 14px;
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

.editor-toggle-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.error-card {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 106, 106, 0.08);
  border: 1px solid rgba(255, 106, 106, 0.22);
  color: #ffd9d9;
}

.label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #ffb9b9;
}

@media (max-width: 1180px) {
  .video-page {
    grid-template-columns: 1fr;
  }
}
</style>
