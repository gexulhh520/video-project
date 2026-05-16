<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type {
  OpenCliProvider,
  OpenCliRuntimeHealthStatus,
  OpenCliProviderStatus,
  AppSettings,
  DraftSummary,
  FrameAssetMode,
  FramePreviewResult,
  GeneratePostOptions,
  PostDraft,
  TaskProgress,
  VideoToPostConfigStatus
} from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";
import AppSettingsModal from "../components/AppSettingsModal.vue";
import DraftEditor from "../components/DraftEditor.vue";
import DraftShelfModal from "../components/DraftShelfModal.vue";
import FramePickerModal from "../components/FramePickerModal.vue";
import MosaicEditorDialog from "../components/MosaicEditorDialog.vue";
import PostPreview from "../components/PostPreview.vue";
import TaskProgressBar from "../components/TaskProgress.vue";
import VideoImporter from "../components/VideoImporter.vue";

const router = useRouter();
const selectedVideoPath = ref<string | null>(null);
const draft = ref<PostDraft | null>(null);
const drafts = ref<DraftSummary[]>([]);
const activeDraftId = ref<string | null>(null);
const loadingDrafts = ref(false);
const draftModalOpen = ref(false);
const settingsOpen = ref(false);
const settingsSaving = ref(false);
const appSettings = ref<AppSettings | null>(null);
const videoToPostConfigStatus = ref<VideoToPostConfigStatus | null>(null);
const openCliHealth = ref<OpenCliRuntimeHealthStatus | null>(null);
const openCliProvider = ref<OpenCliProvider>("chatgpt");
const openCliSelectedProfile = ref("");
const openCliRepairing = ref(false);
const openCliTesting = ref(false);
const openCliTestMessage = ref("");
const busy = ref(false);
const savingDraft = ref(false);
const exportingWord = ref(false);
const exportingImagesArchive = ref(false);
const replacingImageBlockId = ref<string | null>(null);
const editorOpen = ref(false);
const immersiveEditor = ref(false);
const frameOffsetSeconds = ref(2);
const generationUserPrompt = ref("");
const framePickerOpen = ref(false);
const framePickerBlockId = ref<string | null>(null);
const framePickerSectionLabel = ref("");
const framePickerMinSeconds = ref(0);
const framePickerMaxSeconds = ref(0);
const framePickerTimeSeconds = ref(0);
const framePickerPreview = ref<FramePreviewResult | null>(null);
const framePreviewLoading = ref(false);
const frameReplacing = ref(false);
const framePickerAssetMode = ref<FrameAssetMode>("image");
const framePickerGifDurationSeconds = ref(4);
const mosaicEditorOpen = ref(false);
const mosaicEditorImageDataUrl = ref("");
const mosaicEditorSourceImagePath = ref("");
const mosaicEditorTimeSeconds = ref(0);
const mosaicEditorSaving = ref(false);
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
  void loadSettings();
  void loadVideoToPostConfigStatus();
  void checkOpenCliHealthOnEnter();
});

watch(openCliProvider, () => {
  void persistSelectedOpenCliProvider();
});

onBeforeUnmount(() => {
  unsubscribe?.();
});

async function loadSettings(): Promise<void> {
  appSettings.value = await desktopApi.getAppSettings();
}

async function loadVideoToPostConfigStatus(): Promise<void> {
  videoToPostConfigStatus.value = await desktopApi.getVideoToPostConfigStatus();
}

async function checkOpenCliHealthOnEnter(): Promise<void> {
  try {
    openCliHealth.value = await desktopApi.checkOpenCliHealth();
    openCliTestMessage.value = "";
    if (openCliHealth.value.selectedProfile) {
      openCliSelectedProfile.value = openCliHealth.value.selectedProfile;
    }

    const settings = await desktopApi.getVideoToPostSettings();
    openCliProvider.value = settings.openCliProvider ?? "chatgpt";
    if (
      openCliHealth.value.healthy &&
      openCliHealth.value.selectedProfile &&
      (settings.runtime !== "opencli" || settings.openCliProfile !== openCliHealth.value.selectedProfile)
    ) {
      await desktopApi.saveVideoToPostSettings({
        ...settings,
        runtime: "opencli",
        openCliProfile: openCliHealth.value.selectedProfile,
        openCliProvider: settings.openCliProvider ?? "chatgpt"
      });
      await loadVideoToPostConfigStatus();
    }
  } catch {
    openCliHealth.value = null;
  }
}

async function persistSelectedOpenCliProvider(): Promise<void> {
  const provider = openCliProvider.value;
  const settings = await desktopApi.getVideoToPostSettings();
  if (settings.openCliProvider === provider) {
    return;
  }

  await desktopApi.saveVideoToPostSettings({
    ...settings,
    openCliProvider: provider
  });
}

async function refreshOpenCliHealth(): Promise<void> {
  openCliTestMessage.value = "";
  try {
    openCliHealth.value = await desktopApi.checkOpenCliHealth();
    if (openCliHealth.value.selectedProfile) {
      openCliSelectedProfile.value = openCliHealth.value.selectedProfile;
    }
    await loadVideoToPostConfigStatus();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "OpenCLI 检测失败";
  }
}

async function repairOpenCli(): Promise<void> {
  openCliRepairing.value = true;
  openCliTestMessage.value = "";
  try {
    openCliHealth.value = await desktopApi.repairOpenCliRuntime();
    if (openCliHealth.value.selectedProfile) {
      openCliSelectedProfile.value = openCliHealth.value.selectedProfile;
    }
    await loadVideoToPostConfigStatus();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "OpenCLI 修复失败";
  } finally {
    openCliRepairing.value = false;
  }
}

async function openProviderLoginPage(): Promise<void> {
  const profile = openCliSelectedProfile.value.trim() || undefined;
  try {
    await desktopApi.openOpenCliProviderLoginPage(openCliProvider.value, profile);
    openCliTestMessage.value = "已打开登录页，请在浏览器完成登录后再测试。";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "打开登录页失败";
  }
}

async function testOpenCliProvider(): Promise<void> {
  openCliTesting.value = true;
  const profile = openCliSelectedProfile.value.trim() || undefined;
  try {
    const result: OpenCliProviderStatus = await desktopApi.testOpenCliProvider(openCliProvider.value, profile);
    openCliTestMessage.value = result.message || (result.ready ? "连接成功" : "连接失败");
  } catch (error) {
    openCliTestMessage.value = error instanceof Error ? error.message : "测试失败";
  } finally {
    openCliTesting.value = false;
  }
}

async function openSettings(): Promise<void> {
  errorMessage.value = "";
  await loadSettings();
  settingsOpen.value = true;
}

async function browseWorkspaceDir(): Promise<void> {
  const nextDirectory = await desktopApi.selectDirectory();
  if (!nextDirectory) {
    return;
  }

  appSettings.value = {
    ...(appSettings.value ?? {}),
    workspaceDir: nextDirectory
  };
}

async function saveSettings(nextSettings: AppSettings): Promise<void> {
  settingsSaving.value = true;
  errorMessage.value = "";

  try {
    appSettings.value = await desktopApi.saveAppSettings(nextSettings);
    settingsOpen.value = false;
    draft.value = null;
    activeDraftId.value = null;
    progress.value = {
      taskId: progress.value.taskId,
      status: progress.value.status,
      progress: progress.value.progress,
      message: `工作空间已更新为 ${appSettings.value.workspaceDir}`
    };
    await refreshDrafts();
    await loadVideoToPostConfigStatus();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存设置失败";
  } finally {
    settingsSaving.value = false;
  }
}

async function handleSelectVideo(): Promise<void> {
  errorMessage.value = "";
  selectedVideoPath.value = await desktopApi.selectVideo();
}

function updateFrameOffset(value: number): void {
  if (Number.isNaN(value)) {
    frameOffsetSeconds.value = 0;
    return;
  }

  frameOffsetSeconds.value = Math.max(value, 0);
}

function updateGenerationUserPrompt(value: string): void {
  generationUserPrompt.value = value;
}

async function handleGenerate(): Promise<void> {
  if (!selectedVideoPath.value || busy.value) {
    return;
  }

  if (!videoToPostConfigStatus.value?.ready) {
    errorMessage.value = "当前工具配置未完成，请先补全 Key 后再开始生成。";
    return;
  }

  const safeFrameOffset = Number.isFinite(frameOffsetSeconds.value) ? Math.max(frameOffsetSeconds.value, 0) : 0;
  const generateOptions: GeneratePostOptions = {
    frameOffsetSeconds: safeFrameOffset,
    userPrompt: generationUserPrompt.value.trim()
  };

  busy.value = true;
  errorMessage.value = "";
  draft.value = null;
  await persistSelectedOpenCliProvider();
  progress.value = {
    taskId: "queued",
    status: "copying_video",
    progress: 2,
    message: "任务已开始，正在准备文件"
  };

  try {
    draft.value = await desktopApi.generatePost(selectedVideoPath.value, generateOptions);
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

async function handleExportWord(): Promise<void> {
  if (!draft.value || exportingWord.value) {
    return;
  }

  exportingWord.value = true;
  errorMessage.value = "";

  try {
    const exportedPath = await desktopApi.exportDraftToWord(draft.value);
    if (exportedPath) {
      progress.value = {
        taskId: draft.value.draftId,
        status: "completed",
        progress: 100,
        message: `Word 已导出到 ${exportedPath}`
      };
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "导出 Word 失败";
  } finally {
    exportingWord.value = false;
  }
}

async function handleExportImagesArchive(): Promise<void> {
  if (!draft.value || exportingImagesArchive.value) {
    return;
  }

  exportingImagesArchive.value = true;
  errorMessage.value = "";

  try {
    const exportedPath = await desktopApi.exportDraftImagesArchive(draft.value);
    if (exportedPath) {
      progress.value = {
        taskId: draft.value.draftId,
        status: "completed",
        progress: 100,
        message: `文章配图压缩包已导出到 ${exportedPath}`
      };
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "导出文章配图失败";
  } finally {
    exportingImagesArchive.value = false;
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
    message: "已加载历史草稿"
  };
}

async function openDraftModal(): Promise<void> {
  draftModalOpen.value = true;
  await refreshDrafts();
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
      message: "草稿修改已保存"
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
    errorMessage.value = "没有找到对应的图片块";
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
  framePickerAssetMode.value = imageBlock.sourceType === "video-gif" ? "gif" : "image";
  framePickerGifDurationSeconds.value = 4;
  framePickerBlockId.value = blockId;
  framePickerSectionLabel.value = `${imageBlock.sectionId} 建议在 ${framePickerMinSeconds.value.toFixed(1)}s - ${framePickerMaxSeconds.value.toFixed(1)}s 之间选择起始时间`;
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

async function openMosaicEditor(): Promise<void> {
  if (!draft.value || !framePickerBlockId.value || !framePickerPreview.value) {
    return;
  }

  const imageBlock = draft.value.contentBlocks.find(
    (block): block is Extract<PostDraft["contentBlocks"][number], { type: "image" }> =>
      block.type === "image" && block.blockId === framePickerBlockId.value
  );

  if (!imageBlock) {
    errorMessage.value = "没有找到对应的图片块";
    return;
  }

  mosaicEditorImageDataUrl.value = framePickerPreview.value.imageDataUrl;
  mosaicEditorSourceImagePath.value = imageBlock.imagePath;
  mosaicEditorTimeSeconds.value = framePickerTimeSeconds.value;
  mosaicEditorOpen.value = true;
  framePickerOpen.value = false;
}

function closeMosaicEditor(): void {
  mosaicEditorOpen.value = false;
  mosaicEditorImageDataUrl.value = "";
  mosaicEditorSourceImagePath.value = "";
}

async function handleMosaicUseDirectly(): Promise<void> {
  if (!draft.value || !framePickerBlockId.value) {
    return;
  }

  frameReplacing.value = true;
  errorMessage.value = "";

  try {
    draft.value = await desktopApi.replaceDraftImageFromFrame(draft.value.draftId, framePickerBlockId.value, {
      mode: "image",
      timeSeconds: mosaicEditorTimeSeconds.value
    });
    activeDraftId.value = draft.value.draftId;
    await refreshDrafts();
    closeMosaicEditor();
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

async function handleMosaicSave(imageBase64: string): Promise<void> {
  if (!draft.value || !framePickerBlockId.value) {
    return;
  }

  mosaicEditorSaving.value = true;
  errorMessage.value = "";

  try {
    const imageBlock = draft.value.contentBlocks.find(
      (block): block is Extract<PostDraft["contentBlocks"][number], { type: "image" }> =>
        block.type === "image" && block.blockId === framePickerBlockId.value
    );

    if (!imageBlock) {
      throw new Error("没有找到对应的图片块");
    }

    const result = await desktopApi.saveEditedFrame({
      draftId: draft.value.draftId,
      blockId: framePickerBlockId.value,
      sourceImagePath: imageBlock.imagePath,
      imageBase64,
      time: mosaicEditorTimeSeconds.value
    });

    draft.value = result.updatedDraft;
    activeDraftId.value = draft.value.draftId;
    await refreshDrafts();
    closeMosaicEditor();
    progress.value = {
      taskId: draft.value.draftId,
      status: "completed",
      progress: 100,
      message: "已涂抹马赛克并替换图片"
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存马赛克编辑失败";
  } finally {
    mosaicEditorSaving.value = false;
  }
}

async function refreshFramePreview(timeSeconds: number): Promise<void> {
  if (!draft.value) {
    return;
  }

  framePickerTimeSeconds.value = timeSeconds;
  framePreviewLoading.value = true;

  try {
    framePickerPreview.value = await desktopApi.previewDraftFrame(draft.value.draftId, {
      mode: framePickerAssetMode.value,
      timeSeconds,
      durationSeconds: framePickerAssetMode.value === "gif" ? framePickerGifDurationSeconds.value : undefined
    });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "抽取预览帧失败";
  } finally {
    framePreviewLoading.value = false;
  }
}

async function handleFramePickerModeChange(mode: FrameAssetMode): Promise<void> {
  framePickerAssetMode.value = mode;
  await refreshFramePreview(framePickerTimeSeconds.value);
}

async function handleFramePickerGifDurationChange(durationSeconds: number): Promise<void> {
  framePickerGifDurationSeconds.value = durationSeconds;
  await refreshFramePreview(framePickerTimeSeconds.value);
}

async function confirmFrameReplacement(): Promise<void> {
  if (!draft.value || !framePickerBlockId.value || frameReplacing.value) {
    return;
  }

  frameReplacing.value = true;
  errorMessage.value = "";

  try {
    draft.value = await desktopApi.replaceDraftImageFromFrame(draft.value.draftId, framePickerBlockId.value, {
      mode: framePickerAssetMode.value,
      timeSeconds: framePickerTimeSeconds.value,
      durationSeconds: framePickerAssetMode.value === "gif" ? framePickerGifDurationSeconds.value : undefined
    });
    activeDraftId.value = draft.value.draftId;
    await refreshDrafts();
    closeFramePicker();
    progress.value = {
      taskId: draft.value.draftId,
      status: "completed",
      progress: 100,
      message: framePickerAssetMode.value === "gif" ? "已替换为 GIF 动画" : "已从原视频重新选帧并替换图片"
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
      <VideoImporter
        :selected-video-path="selectedVideoPath"
        :busy="busy"
        :frame-offset-seconds="frameOffsetSeconds"
        :user-prompt="generationUserPrompt"
        :config-ready="videoToPostConfigStatus?.ready ?? false"
        @select="handleSelectVideo"
        @generate="handleGenerate"
        @update-frame-offset="updateFrameOffset"
        @update-user-prompt="updateGenerationUserPrompt"
      />

      <div class="mode-card">
        <span class="mode-label">OpenCLI 运行状态</span>
        <strong>{{ openCliHealth?.healthy ? "正常" : "待检测 / 异常" }}</strong>
        <span class="mode-label">Profile：{{ openCliSelectedProfile || openCliHealth?.selectedProfile || "未选择" }}</span>
        <label class="field">
          <span>Provider</span>
          <select v-model="openCliProvider">
            <option value="chatgpt">chatgpt</option>
            <option value="gemini">gemini</option>
            <option value="claude">claude</option>
            <option value="grok">grok</option>
            <option value="doubao">doubao</option>
            <option value="yuanbao">yuanbao</option>
          </select>
        </label>
        <div class="mode-actions">
          <button class="secondary-toggle-btn" :disabled="busy || openCliRepairing" @click="refreshOpenCliHealth">重新检测</button>
          <button class="secondary-toggle-btn" :disabled="busy || openCliRepairing" @click="repairOpenCli">
            {{ openCliRepairing ? "修复中..." : "一键修复" }}
          </button>
          <button class="secondary-toggle-btn" :disabled="busy" @click="openProviderLoginPage">打开模型登录页</button>
          <button class="secondary-toggle-btn" :disabled="busy || openCliTesting" @click="testOpenCliProvider">
            {{ openCliTesting ? "测试中..." : "测试连接" }}
          </button>
        </div>
        <small v-if="openCliTestMessage">{{ openCliTestMessage }}</small>
      </div>

      <div v-if="appSettings" class="workspace-card">
        <span>当前工作空间</span>
        <strong>{{ appSettings.workspaceDir }}</strong>
      </div>

      <div class="quick-actions">
        <button class="draft-trigger-btn" @click="openDraftModal">打开草稿箱</button>
        <button class="draft-trigger-btn" @click="openSettings">全局设置</button>
        <button class="export-btn" :disabled="!draft || exportingWord" @click="handleExportWord">
          {{ exportingWord ? "正在导出 Word..." : "导出到 Word" }}
        </button>
        <button class="draft-trigger-btn" :disabled="!draft || exportingImagesArchive" @click="handleExportImagesArchive">
          {{ exportingImagesArchive ? "正在导出文章配图..." : "导出文章的配图" }}
        </button>
      </div>

      <div class="mode-card">
        <span class="mode-label">当前模式</span>
        <strong>{{ editorOpen ? "编辑模式" : "预览模式" }}</strong>
        <div class="mode-actions">
          <button v-if="editorOpen" class="secondary-toggle-btn" :disabled="!draft" @click="toggleImmersiveEditor">
            {{ immersiveEditor ? "退出沉浸编辑" : "沉浸编辑" }}
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
          <strong>修改标题、段落和图片，然后直接导出 Word</strong>
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
      :asset-mode="framePickerAssetMode"
      :gif-duration-seconds="framePickerGifDurationSeconds"
      @close="closeFramePicker"
      @change-time="refreshFramePreview"
      @change-mode="handleFramePickerModeChange"
      @change-gif-duration="handleFramePickerGifDurationChange"
      @confirm="confirmFrameReplacement"
      @open-mosaic-editor="openMosaicEditor"
    />

    <MosaicEditorDialog
      :open="mosaicEditorOpen"
      :source-image-data-url="mosaicEditorImageDataUrl"
      :source-image-path="mosaicEditorSourceImagePath"
      :time-seconds="mosaicEditorTimeSeconds"
      :saving="mosaicEditorSaving"
      @close="closeMosaicEditor"
      @use-directly="handleMosaicUseDirectly"
      @save-mosaic="handleMosaicSave"
    />

    <DraftShelfModal
      :open="draftModalOpen"
      :drafts="drafts"
      :active-draft-id="activeDraftId"
      :loading="loadingDrafts"
      @close="draftModalOpen = false"
      @open-draft="openDraft"
      @refresh="refreshDrafts"
    />

    <AppSettingsModal
      :open="settingsOpen"
      :settings="appSettings"
      :saving="settingsSaving"
      @close="settingsOpen = false"
      @browse="browseWorkspaceDir"
      @save="saveSettings"
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

.back-btn,
.draft-trigger-btn,
.export-btn {
  min-height: 46px;
  border-radius: 14px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.back-btn,
.draft-trigger-btn {
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
}

.export-btn {
  background: linear-gradient(135deg, #79f0d5, #47b9ff);
  color: #08111f;
}

.export-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.workspace-card {
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
}

.workspace-card span {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #86a8d5;
}

.workspace-card strong {
  display: block;
  line-height: 1.6;
  word-break: break-all;
}

.quick-actions {
  display: grid;
  gap: 12px;
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

.field {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.field span {
  font-size: 12px;
  color: #92abd1;
}

.field select {
  min-height: 40px;
  border-radius: 12px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
  padding: 0 12px;
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
