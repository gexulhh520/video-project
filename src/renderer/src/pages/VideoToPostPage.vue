<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { DraftSummary, PostDraft, TaskProgress } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";
import DraftShelf from "../components/DraftShelf.vue";
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
  progress.value = {
    taskId: draftId,
    status: "completed",
    progress: 100,
    message: "已从草稿箱加载历史结果"
  };
}
</script>

<template>
  <section class="video-page">
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
      <PostPreview :draft="draft" />
      <TaskProgressBar :progress="progress" />
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
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 18px;
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
