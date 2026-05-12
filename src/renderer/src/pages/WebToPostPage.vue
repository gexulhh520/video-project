<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type {
  AppSettings,
  ContentBlock,
  PostDraft,
  WebCrawlRecord,
  WebCrawlTask,
  WebImageAsset,
  WebRewriteResult,
  WebTaskProgress,
  WebTaskSummary,
  WebToPostConfigStatus,
  WebToPostSettings
} from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";
import AppSettingsModal from "../components/AppSettingsModal.vue";
import WebToPostSettingsModal from "../components/WebToPostSettingsModal.vue";

const router = useRouter();

const appSettings = ref<AppSettings | null>(null);
const settingsOpen = ref(false);
const settingsSaving = ref(false);
const toolSettingsOpen = ref(false);
const toolSettingsSaving = ref(false);
const toolSettings = ref<WebToPostSettings | null>(null);
const toolConfigStatus = ref<WebToPostConfigStatus | null>(null);
const taskList = ref<WebTaskSummary[]>([]);
const activeTask = ref<WebCrawlTask | null>(null);
const taskLoading = ref(false);
const busy = ref(false);
const exportBusy = ref(false);
const rewriteSaveBusy = ref(false);
const selectingUploadImage = ref(false);
const errorMessage = ref("");
const urlInput = ref("");
const extractPromptInput = ref("");
const rewritePromptInput = ref("");
const editableBody = ref("");
const selectedRecordId = ref("");
const rewriteSelectedRecordIds = ref<string[]>([]);
const autoCrawlEnabled = ref(false);
const autoExtraUrls = ref<string[]>([]);
const confirmImagePoolOpen = ref(false);
const rewriteResultOpen = ref(false);
const imagePickerSectionId = ref<string | null>(null);
const rewriteDraft = ref<WebRewriteResult | null>(null);
const imageUrlsByPath = ref<Record<string, string>>({});
const progress = ref<WebTaskProgress>({
  taskId: "idle",
  status: "idle",
  progress: 0,
  message: "等待创建任务"
});

const historyRecordsOpen = ref(false);
const editingRecordId = ref<string | null>(null);
const editingRecordTitle = ref("");
const editingRecordBody = ref("");
const viewingRecordImagePool = ref<string | null>(null);
const selectedImageAssetIds = ref<string[]>([]);
const taskListModalOpen = ref(false);
const editingTaskId = ref<string | null>(null);
const editingTaskTitle = ref("");

let unsubscribe: (() => void) | null = null;

const historyRecords = computed(() => activeTask.value?.records ?? []);

const visibleTaskList = computed(() => taskList.value.slice(0, 2));

const currentRecord = computed<WebCrawlRecord | null>(() => {
  const records = activeTask.value?.records ?? [];
  if (!records.length) {
    return null;
  }

  return records.find((item) => item.recordId === selectedRecordId.value) ?? records[0] ?? null;
});

const confirmedRecords = computed(() =>
  activeTask.value?.records.filter((record) => record.userEditedBody.trim()).length ?? 0
);

const rewriteCandidateRecords = computed(() =>
  activeTask.value?.records.filter((record) => record.userEditedBody.trim()) ?? []
);

const currentRecordImageAssets = computed(() => {
  if (!activeTask.value || !currentRecord.value) {
    return [] as WebImageAsset[];
  }

  const assetMap = new Map(activeTask.value.imageAssets.map((asset) => [asset.assetId, asset]));
  return currentRecord.value.imageAssetIds
    .map((assetId) => assetMap.get(assetId))
    .filter((asset): asset is WebImageAsset => Boolean(asset));
});

const viewingRecordImageAssets = computed(() => {
  if (!activeTask.value || !viewingRecordImagePool.value) {
    return [] as WebImageAsset[];
  }
  const record = activeTask.value.records.find((r) => r.recordId === viewingRecordImagePool.value);
  if (!record) {
    return [] as WebImageAsset[];
  }
  const assetMap = new Map(activeTask.value.imageAssets.map((asset) => [asset.assetId, asset]));
  return record.imageAssetIds
    .map((assetId) => assetMap.get(assetId))
    .filter((asset): asset is WebImageAsset => Boolean(asset));
});

const rewriteSourceRecordIds = computed(() => rewriteDraft.value?.sourceRecordIds ?? rewriteSelectedRecordIds.value);

const rewriteSourceImageAssets = computed(() => {
  if (!activeTask.value) {
    return [] as WebImageAsset[];
  }

  return activeTask.value.imageAssets.filter((asset) => rewriteSourceRecordIds.value.includes(asset.originRecordId));
});

const rewriteParagraphBlocks = computed(() =>
  (rewriteDraft.value?.contentBlocks.filter((block) => block.type === "paragraph") as Extract<
    ContentBlock,
    { type: "paragraph" }
  >[]) ?? []
);

const runtimeStatusLabel = computed(() => {
  const status = progress.value.status;

  if (status === "checking_runtime_health") {
    return "检测中";
  }

  if (status === "resetting_runtime") {
    return "正在重置";
  }

  if (
    [
      "opening_page",
      "waiting_page_ready",
      "fetching_title",
      "capturing_snapshot",
      "extracting_article",
      "awaiting_user_confirmation",
      "collecting_images",
      "closing_tab",
      "ready_for_next_url",
      "rewriting",
      "completed"
    ].includes(status)
  ) {
    return "正常";
  }

  if (activeTask.value?.runtimeHealth?.healthy) {
    return "正常";
  }

  return "待检测 / 异常";
});

watch(
  currentRecord,
  (record) => {
    editableBody.value = record?.userEditedBody ?? "";
    extractPromptInput.value = record?.extractPrompt ?? "";
    if (record?.sourceUrl && (!urlInput.value || record.recordId === selectedRecordId.value)) {
      urlInput.value = record.sourceUrl;
    }
  },
  { immediate: true }
);

watch(
  () => activeTask.value?.rewritePrompt,
  (prompt) => {
    rewritePromptInput.value = prompt ?? "";
  },
  { immediate: true }
);

watch(
  () => activeTask.value?.currentRecordId,
  (recordId) => {
    if (recordId) {
      selectedRecordId.value = recordId;
    }
  },
  { immediate: true }
);

watch(
  [historyRecords, rewriteCandidateRecords],
  ([records, candidates]) => {
    if (!records.length) {
      selectedRecordId.value = "";
    } else if (!records.some((record) => record.recordId === selectedRecordId.value)) {
      selectedRecordId.value = activeTask.value?.currentRecordId ?? records[0]?.recordId ?? "";
    }

    const candidateIds = new Set(candidates.map((record) => record.recordId));
    const nextSelectedIds = rewriteSelectedRecordIds.value.filter((recordId) => candidateIds.has(recordId));
    if (nextSelectedIds.length > 0) {
      rewriteSelectedRecordIds.value = nextSelectedIds;
      return;
    }

    const defaultRecordId =
      candidates.find((record) => record.recordId === activeTask.value?.currentRecordId)?.recordId ?? candidates[0]?.recordId ?? "";
    rewriteSelectedRecordIds.value = defaultRecordId ? [defaultRecordId] : [];
  },
  { immediate: true }
);

watch(
  () => activeTask.value?.rewriteResult?.updatedAt,
  () => {
    if (!rewriteResultOpen.value && activeTask.value?.rewriteResult) {
      rewriteDraft.value = cloneRewriteResult(activeTask.value.rewriteResult);
    }

    if (!activeTask.value?.rewriteResult) {
      rewriteDraft.value = null;
    }
  },
  { immediate: true }
);

watch(
  [currentRecordImageAssets, rewriteSourceImageAssets, rewriteDraft, viewingRecordImageAssets],
  async () => {
    const imagePaths = new Set<string>();

    currentRecordImageAssets.value.forEach((asset) => {
      if (asset.localPath) {
        imagePaths.add(asset.localPath);
      }
    });

    rewriteSourceImageAssets.value.forEach((asset) => {
      if (asset.localPath) {
        imagePaths.add(asset.localPath);
      }
    });

    rewriteDraft.value?.contentBlocks.forEach((block) => {
      if (block.type === "image" && block.imagePath) {
        imagePaths.add(block.imagePath);
      }
    });

    viewingRecordImageAssets.value.forEach((asset) => {
      if (asset.localPath) {
        imagePaths.add(asset.localPath);
      }
    });

    const pendingPaths = Array.from(imagePaths).filter((path) => !imageUrlsByPath.value[path]);
    if (!pendingPaths.length) {
      return;
    }

    const nextEntries = await Promise.all(
      pendingPaths.map(async (path) => [path, await desktopApi.readImageAsDataUrl(path)] as const)
    );
    imageUrlsByPath.value = {
      ...imageUrlsByPath.value,
      ...Object.fromEntries(nextEntries)
    };
  },
  { immediate: true }
);

onMounted(() => {
  unsubscribe = desktopApi.onWebTaskProgress((nextProgress) => {
    progress.value = nextProgress;
  });
  void bootstrap();
});

onBeforeUnmount(() => {
  unsubscribe?.();
});

async function bootstrap(): Promise<void> {
  await Promise.all([loadSettings(), loadToolConfigStatus(), refreshTaskList(), loadToolSettings()]);
}

async function loadSettings(): Promise<void> {
  appSettings.value = await desktopApi.getAppSettings();
}

async function loadToolSettings(): Promise<void> {
  toolSettings.value = await desktopApi.getWebToPostSettings();
}

async function loadToolConfigStatus(): Promise<void> {
  toolConfigStatus.value = await desktopApi.getWebToPostConfigStatus();
}

async function refreshTaskList(): Promise<void> {
  taskList.value = await desktopApi.listWebTasks();
  if (!activeTask.value && taskList.value.length > 0) {
    await openTask(taskList.value[0].taskId);
  }
}

async function openTask(taskId: string): Promise<void> {
  taskLoading.value = true;
  errorMessage.value = "";

  try {
    activeTask.value = await desktopApi.getWebTaskById(taskId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "读取任务失败";
  } finally {
    taskLoading.value = false;
  }
}

async function createTask(): Promise<void> {
  busy.value = true;
  errorMessage.value = "";

  try {
    activeTask.value = await desktopApi.createWebTask();
    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "创建任务失败";
  } finally {
    busy.value = false;
  }
}

async function runCrawl(recordId?: string): Promise<void> {
  if (!activeTask.value || !urlInput.value.trim() || busy.value) {
    return;
  }

  if (!toolConfigStatus.value?.ready) {
    errorMessage.value = "请先补齐网页工具配置，再开始抓取。";
    return;
  }

  busy.value = true;
  errorMessage.value = "";

  try {
    if (autoCrawlEnabled.value) {
      const crawlUrls = [urlInput.value.trim(), ...autoExtraUrls.value.map((item) => item.trim()).filter(Boolean)];
      activeTask.value = await runAutoCrawlPipeline(activeTask.value.taskId, crawlUrls);
    } else {
      activeTask.value = await desktopApi.startWebCrawl(activeTask.value.taskId, {
        url: urlInput.value.trim(),
        recordId
      });
    }

    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "执行抓取失败";
  } finally {
    busy.value = false;
  }
}

async function runAutoCrawlPipeline(taskId: string, crawlUrls: string[]): Promise<WebCrawlTask> {
  const validUrls = crawlUrls.filter(Boolean);
  if (!validUrls.length) {
    throw new Error("请至少填写一个抓取入口。");
  }

  const autoRecordIds: string[] = [];
  let nextTask = await desktopApi.getWebTaskById(taskId);

  for (let index = 0; index < validUrls.length; index += 1) {
    const url = validUrls[index];
    progress.value = {
      taskId,
      status: "opening_page",
      progress: Math.min(20 + index * 10, 70),
      message: `全自动：正在抓取第 ${index + 1}/${validUrls.length} 个链接`
    };

    nextTask = await desktopApi.startWebCrawl(taskId, { url });
    const currentRecordId = nextTask.currentRecordId;
    if (!currentRecordId) {
      throw new Error(`第 ${index + 1} 个链接未生成记录，已停止全自动流程。`);
    }
    if (nextTask.status !== "awaiting_user_confirmation") {
      throw new Error(`第 ${index + 1} 个链接正文提取未完成（状态：${nextTask.status}）。`);
    }
    const currentRecord = nextTask.records.find((item) => item.recordId === currentRecordId);
    if (!currentRecord?.tabId) {
      throw new Error(`第 ${index + 1} 个链接缺少 tabId，无法继续自动抓图。`);
    }

    progress.value = {
      taskId,
      recordId: currentRecordId,
      status: "awaiting_user_confirmation",
      progress: Math.min(25 + index * 10, 75),
      message: `全自动：正在确认第 ${index + 1} 条正文`
    };

    nextTask = await desktopApi.saveWebRecordBody(taskId, {
      recordId: currentRecordId,
      body: currentRecord.userEditedBody || currentRecord.extractedBody
    });

    progress.value = {
      taskId,
      recordId: currentRecordId,
      status: "collecting_images",
      progress: Math.min(30 + index * 10, 80),
      message: `全自动：正在抓取第 ${index + 1} 条正文图片`
    };

    nextTask = await desktopApi.collectWebRecordImages(taskId, currentRecordId);
    autoRecordIds.push(currentRecordId);
  }

  rewriteSelectedRecordIds.value = autoRecordIds;

  progress.value = {
    taskId,
    status: "rewriting",
    progress: 88,
    message: "全自动：正在二次原创"
  };

  nextTask = await desktopApi.rewriteWebTask(taskId, {
    prompt: rewritePromptInput.value,
    recordIds: autoRecordIds
  });

  rewriteDraft.value = nextTask.rewriteResult ? cloneRewriteResult(nextTask.rewriteResult) : null;
  rewriteResultOpen.value = Boolean(rewriteDraft.value);
  imagePickerSectionId.value = null;

  const exportResult = await desktopApi.autoExportWebTaskBundle(taskId);
  progress.value = {
    taskId,
    status: "completed",
    progress: 100,
    message: `全自动完成，已导出到 ${exportResult.outputDir}`
  };

  return nextTask;
}

function addAutoUrl(): void {
  autoExtraUrls.value.push("");
}

function removeAutoUrl(index: number): void {
  autoExtraUrls.value = autoExtraUrls.value.filter((_, itemIndex) => itemIndex !== index);
}

async function saveConfirmedBody(): Promise<void> {
  if (!activeTask.value || !currentRecord.value) {
    return;
  }

  busy.value = true;
  errorMessage.value = "";

  try {
    activeTask.value = await desktopApi.saveWebRecordBody(activeTask.value.taskId, {
      recordId: currentRecord.value.recordId,
      body: editableBody.value
    });
    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存正文失败";
  } finally {
    busy.value = false;
  }
}

async function retryExtract(): Promise<void> {
  if (!activeTask.value || !currentRecord.value) {
    return;
  }

  busy.value = true;
  errorMessage.value = "";

  try {
    activeTask.value = await desktopApi.retryWebRecordExtract(activeTask.value.taskId, {
      recordId: currentRecord.value.recordId,
      prompt: extractPromptInput.value
    });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "重新提取失败";
  } finally {
    busy.value = false;
  }
}

async function collectImages(): Promise<void> {
  if (!activeTask.value || !currentRecord.value) {
    return;
  }

  busy.value = true;
  errorMessage.value = "";

  try {
    activeTask.value = await desktopApi.collectWebRecordImages(activeTask.value.taskId, currentRecord.value.recordId);
    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "抓取图片失败";
  } finally {
    busy.value = false;
  }
}

async function deleteRecord(recordId: string): Promise<void> {
  if (!activeTask.value) {
    return;
  }

  busy.value = true;
  errorMessage.value = "";

  try {
    activeTask.value = await desktopApi.deleteWebRecord(activeTask.value.taskId, { recordId });
    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "删除记录失败";
  } finally {
    busy.value = false;
  }
}

function openHistoryRecords(): void {
  historyRecordsOpen.value = true;
}

function closeHistoryRecords(): void {
  historyRecordsOpen.value = false;
  editingRecordId.value = null;
  viewingRecordImagePool.value = null;
  selectedImageAssetIds.value = [];
}

function startEditingRecord(record: WebCrawlRecord): void {
  editingRecordId.value = record.recordId;
  editingRecordTitle.value = record.title;
  editingRecordBody.value = record.userEditedBody || record.extractedBody;
}

function cancelEditingRecord(): void {
  editingRecordId.value = null;
  editingRecordTitle.value = "";
  editingRecordBody.value = "";
}

async function saveEditingRecord(recordId: string): Promise<void> {
  if (!activeTask.value) {
    return;
  }

  busy.value = true;
  errorMessage.value = "";

  try {
    activeTask.value = await desktopApi.saveWebRecordBody(activeTask.value.taskId, {
      recordId,
      body: editingRecordBody.value
    });
    await refreshTaskList();
    editingRecordId.value = null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存记录失败";
  } finally {
    busy.value = false;
  }
}

function openRecordImagePool(recordId: string): void {
  viewingRecordImagePool.value = recordId;
  selectedImageAssetIds.value = [];
}

function closeRecordImagePool(): void {
  viewingRecordImagePool.value = null;
  selectedImageAssetIds.value = [];
}

function toggleImageAssetSelection(assetId: string, checked: boolean): void {
  if (checked) {
    selectedImageAssetIds.value = Array.from(new Set([...selectedImageAssetIds.value, assetId]));
  } else {
    selectedImageAssetIds.value = selectedImageAssetIds.value.filter((id) => id !== assetId);
  }
}

async function deleteSelectedImages(): Promise<void> {
  if (!activeTask.value || !viewingRecordImagePool.value || selectedImageAssetIds.value.length === 0) {
    return;
  }

  busy.value = true;
  errorMessage.value = "";

  try {
    let task = activeTask.value;
    const record = task.records.find((r) => r.recordId === viewingRecordImagePool.value);
    if (record) {
      record.imageAssetIds = record.imageAssetIds.filter((id) => !selectedImageAssetIds.value.includes(id));
    }
    task.imageAssets = task.imageAssets.filter((asset) => !selectedImageAssetIds.value.includes(asset.assetId));
    task.updatedAt = new Date().toISOString();
    activeTask.value = task;
    selectedImageAssetIds.value = [];
    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "删除图片失败";
  } finally {
    busy.value = false;
  }
}

function startEditingTask(task: WebTaskSummary): void {
  editingTaskId.value = task.taskId;
  editingTaskTitle.value = task.title;
}

async function saveEditingTask(taskId: string): Promise<void> {
  busy.value = true;
  errorMessage.value = "";

  try {
    await desktopApi.renameWebTask(taskId, editingTaskTitle.value);
    await refreshTaskList();
    editingTaskId.value = null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "重命名任务失败";
  } finally {
    busy.value = false;
  }
}

async function deleteTask(taskId: string): Promise<void> {
  busy.value = true;
  errorMessage.value = "";

  try {
    await desktopApi.deleteWebTask(taskId);
    if (activeTask.value?.taskId === taskId) {
      activeTask.value = null;
    }
    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "删除任务失败";
  } finally {
    busy.value = false;
  }
}

async function rewriteTask(): Promise<void> {
  if (!activeTask.value) {
    return;
  }

  if (!rewriteSelectedRecordIds.value.length) {
    errorMessage.value = "请先勾选需要参与二次原创的正文。";
    return;
  }

  busy.value = true;
  errorMessage.value = "";

  try {
    activeTask.value = await desktopApi.rewriteWebTask(activeTask.value.taskId, {
      prompt: rewritePromptInput.value,
      recordIds: rewriteSelectedRecordIds.value
    });
    rewriteDraft.value = activeTask.value.rewriteResult ? cloneRewriteResult(activeTask.value.rewriteResult) : null;
    rewriteResultOpen.value = Boolean(rewriteDraft.value);
    imagePickerSectionId.value = null;
    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "二次原创失败";
  } finally {
    busy.value = false;
  }
}

function openConfirmImagePool(): void {
  if (!currentRecordImageAssets.value.length) {
    return;
  }

  confirmImagePoolOpen.value = true;
}

function closeConfirmImagePool(): void {
  confirmImagePoolOpen.value = false;
}

function openRewriteResult(): void {
  if (!activeTask.value?.rewriteResult) {
    return;
  }

  rewriteDraft.value = cloneRewriteResult(activeTask.value.rewriteResult);
  rewriteResultOpen.value = true;
  imagePickerSectionId.value = null;
}

function closeRewriteResult(): void {
  rewriteResultOpen.value = false;
  imagePickerSectionId.value = null;
}

function toggleRewriteRecord(recordId: string, checked: boolean): void {
  if (checked) {
    rewriteSelectedRecordIds.value = Array.from(new Set([...rewriteSelectedRecordIds.value, recordId]));
    return;
  }

  rewriteSelectedRecordIds.value = rewriteSelectedRecordIds.value.filter((item) => item !== recordId);
}

function updateRewriteTitle(value: string): void {
  if (!rewriteDraft.value) {
    return;
  }

  rewriteDraft.value.title = value;
  rewriteDraft.value.updatedAt = new Date().toISOString();
}

function updateParagraphText(blockId: string, value: string): void {
  if (!rewriteDraft.value) {
    return;
  }

  const targetBlock = rewriteDraft.value.contentBlocks.find(
    (block): block is Extract<ContentBlock, { type: "paragraph" }> => block.type === "paragraph" && block.blockId === blockId
  );
  if (!targetBlock) {
    return;
  }

  targetBlock.text = value;
  targetBlock.edited = true;
  syncRewriteDraftText();
}

function syncRewriteDraftText(): void {
  if (!rewriteDraft.value) {
    return;
  }

  rewriteDraft.value.paragraphs = rewriteDraft.value.contentBlocks
    .filter((block): block is Extract<ContentBlock, { type: "paragraph" }> => block.type === "paragraph")
    .map((block) => block.text.trim())
    .filter(Boolean);
  rewriteDraft.value.fullText = rewriteDraft.value.paragraphs.join("\n\n");
  rewriteDraft.value.updatedAt = new Date().toISOString();
}

function getSectionImages(sectionId: string): Extract<ContentBlock, { type: "image" }>[] {
  return (rewriteDraft.value?.contentBlocks.filter(
    (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image" && block.sectionId === sectionId
  ) ?? []) as Extract<ContentBlock, { type: "image" }>[];
}

function openImagePicker(sectionId: string): void {
  imagePickerSectionId.value = sectionId;
}

function closeImagePicker(): void {
  imagePickerSectionId.value = null;
}

async function insertRecordImage(asset: WebImageAsset): Promise<void> {
  if (!imagePickerSectionId.value || !asset.localPath) {
    return;
  }

  insertImageBlock(imagePickerSectionId.value, asset.localPath, asset.sourceUrl, "auto");
  imagePickerSectionId.value = null;
}

async function uploadImageToSection(): Promise<void> {
  if (!imagePickerSectionId.value || selectingUploadImage.value) {
    return;
  }

  selectingUploadImage.value = true;
  try {
    const imagePath = await desktopApi.selectImage();
    if (!imagePath) {
      return;
    }

    if (!imageUrlsByPath.value[imagePath]) {
      imageUrlsByPath.value = {
        ...imageUrlsByPath.value,
        [imagePath]: await desktopApi.readImageAsDataUrl(imagePath)
      };
    }

    insertImageBlock(imagePickerSectionId.value, imagePath, "本地上传图片", "upload");
    imagePickerSectionId.value = null;
  } finally {
    selectingUploadImage.value = false;
  }
}

function insertImageBlock(
  sectionId: string,
  imagePath: string,
  caption: string,
  sourceType: "auto" | "upload"
): void {
  if (!rewriteDraft.value) {
    return;
  }

  const nextBlock: Extract<ContentBlock, { type: "image" }> = {
    type: "image",
    blockId: `web_img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sectionId,
    imagePath,
    time: Date.now(),
    caption,
    sourceType
  };

  const paragraphIndex = rewriteDraft.value.contentBlocks.findIndex(
    (block) => block.type === "paragraph" && block.sectionId === sectionId
  );
  if (paragraphIndex < 0) {
    return;
  }

  let insertIndex = paragraphIndex + 1;
  while (
    insertIndex < rewriteDraft.value.contentBlocks.length &&
    rewriteDraft.value.contentBlocks[insertIndex]?.sectionId === sectionId &&
    rewriteDraft.value.contentBlocks[insertIndex]?.type === "image"
  ) {
    insertIndex += 1;
  }

  rewriteDraft.value.contentBlocks.splice(insertIndex, 0, nextBlock);
  rewriteDraft.value.updatedAt = new Date().toISOString();
}

function removeImageBlock(blockId: string): void {
  if (!rewriteDraft.value) {
    return;
  }

  rewriteDraft.value.contentBlocks = rewriteDraft.value.contentBlocks.filter((block) => block.blockId !== blockId);
  rewriteDraft.value.updatedAt = new Date().toISOString();
}

async function saveRewriteResult(): Promise<void> {
  if (!activeTask.value || !rewriteDraft.value || rewriteSaveBusy.value) {
    return;
  }

  rewriteSaveBusy.value = true;
  errorMessage.value = "";

  try {
    syncRewriteDraftText();
    activeTask.value = await desktopApi.saveWebRewriteResult(activeTask.value.taskId, {
      rewriteResult: cloneRewriteResult(rewriteDraft.value)
    });
    rewriteDraft.value = activeTask.value.rewriteResult ? cloneRewriteResult(activeTask.value.rewriteResult) : null;
    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存原创结果失败";
  } finally {
    rewriteSaveBusy.value = false;
  }
}

async function exportRewriteResult(): Promise<void> {
  if (!rewriteDraft.value || exportBusy.value) {
    return;
  }

  exportBusy.value = true;
  errorMessage.value = "";

  try {
    syncRewriteDraftText();
    const outputPath = await desktopApi.exportDraftToWord(buildExportDraft(rewriteDraft.value, activeTask.value?.taskId ?? "web-task"));
    if (outputPath) {
      progress.value = {
        taskId: activeTask.value?.taskId ?? "web-task",
        status: "completed",
        progress: 100,
        message: `Word 已导出到 ${outputPath}`
      };
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "导出 Word 失败";
  } finally {
    exportBusy.value = false;
  }
}

async function openSettings(): Promise<void> {
  await loadSettings();
  settingsOpen.value = true;
}

async function browseWorkspaceDir(): Promise<void> {
  const nextDirectory = await desktopApi.selectDirectory();
  if (!nextDirectory) {
    return;
  }

  appSettings.value = {
    workspaceDir: nextDirectory
  };
}

async function saveSettings(nextSettings: AppSettings): Promise<void> {
  settingsSaving.value = true;

  try {
    appSettings.value = await desktopApi.saveAppSettings(nextSettings);
    settingsOpen.value = false;
    await refreshTaskList();
  } finally {
    settingsSaving.value = false;
  }
}

async function openToolSettings(): Promise<void> {
  await loadToolSettings();
  toolSettingsOpen.value = true;
}

async function saveToolSettings(nextSettings: WebToPostSettings): Promise<void> {
  toolSettingsSaving.value = true;

  try {
    toolSettings.value = await desktopApi.saveWebToPostSettings(nextSettings);
    toolSettingsOpen.value = false;
    await loadToolConfigStatus();
  } finally {
    toolSettingsSaving.value = false;
  }
}

function cloneRewriteResult(result: WebRewriteResult): WebRewriteResult {
  return JSON.parse(JSON.stringify(result)) as WebRewriteResult;
}

function buildExportDraft(result: WebRewriteResult, draftId: string): PostDraft {
  return {
    draftId,
    title: result.title,
    fullText: result.fullText,
    sections: result.paragraphs.map((paragraph, index) => ({
      sectionId: `web_s_${index + 1}`,
      paragraph,
      sourceTimeRanges: []
    })),
    contentBlocks: JSON.parse(JSON.stringify(result.contentBlocks)) as ContentBlock[],
    createdAt: result.createdAt,
    updatedAt: result.updatedAt
  };
}

function summarizeUrl(value: string, maxLength = 56): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const compact = `${url.hostname}${url.pathname}`.replace(/\/$/, "");
    return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
  } catch {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
  }
}

function summarizeBody(value: string, maxLength = 96): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "暂无正文";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
</script>

<template>
  <section class="web-page">
    <aside class="sidebar">
      <button class="ghost-btn" @click="router.push('/')">返回工具箱</button>
      <button class="primary-btn" :disabled="busy" @click="createTask">创建任务</button>

      <div class="panel">
        <span class="label">任务列表</span>
        <div class="task-list">
          <button
            v-for="task in visibleTaskList"
            :key="task.taskId"
            class="task-item"
            :class="{ active: activeTask?.taskId === task.taskId }"
            @click="openTask(task.taskId)"
          >
            <strong>{{ task.title }}</strong>
            <span>{{ task.recordCount }} 条链接 · {{ task.status }}</span>
          </button>
          <div v-if="!taskList.length" class="empty-note">还没有任务，先创建一个。</div>
        </div>
        <button class="ghost-btn view-all-tasks-btn" :disabled="taskList.length <= 2" @click="taskListModalOpen = true">
          查看全部任务 ({{ taskList.length }})
        </button>
      </div>

      <div class="panel">
        <span class="label">当前任务状态</span>
        <strong class="status-text">{{ progress.message }}</strong>
        <span class="subtle">{{ Math.round(progress.progress) }}%</span>
        <span class="subtle">浏览器环境：{{ runtimeStatusLabel }}</span>
      </div>

      <div class="panel">
        <span class="label">抓取入口</span>
        <input v-model="urlInput" type="text" placeholder="输入网页链接" />
        <label class="toggle-row">
          <input v-model="autoCrawlEnabled" type="checkbox" />
          <span>全自动爬取（自动确认正文、抓图、二次原创并导出）</span>
        </label>
        <div v-if="autoCrawlEnabled" class="auto-url-list">
          <div v-for="(item, index) in autoExtraUrls" :key="`auto-url-${index}`" class="auto-url-item">
            <input v-model="autoExtraUrls[index]" type="text" :placeholder="`附加抓取入口 ${index + 2}`" />
            <button class="ghost-btn small-btn" @click="removeAutoUrl(index)">删除</button>
          </div>
          <button class="ghost-btn small-btn" @click="addAutoUrl">新增抓取入口</button>
        </div>
        <div class="stack-actions">
          <button class="primary-btn" :disabled="busy || !activeTask" @click="runCrawl()">开始爬取</button>
          <button class="ghost-btn" :disabled="busy || !currentRecord || autoCrawlEnabled" @click="runCrawl(currentRecord?.recordId)">
            重新执行当前正文
          </button>
        </div>
        <small>开始爬取会新增一条正文记录；重新执行只会更新当前这条正文。</small>
      </div>

      <div class="panel">
        <span class="label">工具配置</span>
        <strong>LLM: {{ toolConfigStatus?.resolvedLlmModel ?? "-" }}</strong>
        <span class="subtle">缺失项：{{ toolConfigStatus?.missingItems.join("、") || "无" }}</span>
        <div class="stack-actions">
          <button class="ghost-btn" @click="openToolSettings">网页工具配置</button>
          <button class="ghost-btn" @click="openSettings">全局设置</button>
        </div>
      </div>
    </aside>

    <main class="main-grid">
      <section class="content-panel full-height-panel">
        <div class="panel-header">
          <div>
            <span class="eyebrow">Confirm</span>
            <h2>正文确认区</h2>
          </div>
          <div class="header-meta">
            <span>{{ currentRecord?.title || "等待抓取标题" }}</span>
            <span>{{ currentRecord?.sourceUrl ? summarizeUrl(currentRecord.sourceUrl, 72) : "尚未输入链接" }}</span>
          </div>
        </div>

        <div v-if="taskLoading" class="empty-state">正在读取任务...</div>
        <div v-else-if="!activeTask" class="empty-state">先创建一个任务，再开始抓取链接。</div>
        <div v-else class="editor-shell">
          <div class="history-shell compact">
            <div class="history-header">
              <strong>当前任务历史正文</strong>
              <span>{{ historyRecords.length }} 条</span>
            </div>
            <button class="primary-btn" @click="openHistoryRecords">查看历史正文列表</button>
            <div v-if="!historyRecords.length" class="empty-note">开始爬取后，这里会累积当前任务下的历史链接正文。</div>
            <div v-else class="record-list-preview">
              <div
                v-for="record in historyRecords.slice(0, 3)"
                :key="record.recordId"
                class="record-preview-item"
                :class="{ active: currentRecord?.recordId === record.recordId }"
                @click="selectedRecordId = record.recordId"
              >
                <span>{{ record.title || summarizeUrl(record.sourceUrl, 44) }}</span>
              </div>
              <div v-if="historyRecords.length > 3" class="more-records-hint">还有 {{ historyRecords.length - 3 }} 条...</div>
            </div>
          </div>

          <div v-if="!currentRecord" class="empty-state">输入链接后开始抓取，这里会显示标题和提取正文。</div>
          <template v-else>
            <label class="field">
              <span>网页标题</span>
              <input :value="currentRecord.title" type="text" disabled />
            </label>

            <div class="body-content-card">
              <span class="field-label">正文内容</span>
              <textarea
                v-model="editableBody"
                rows="16"
                placeholder="抓取后，这里会出现 LLM 提取的正文。"
              />
              <div class="field-actions">
                <button class="primary-btn" :disabled="busy" @click="saveConfirmedBody">保存正文修改</button>
                <button class="ghost-btn" :disabled="busy" @click="collectImages">确认正文并抓取图片</button>
              </div>
            </div>

            <div class="inline-media-entry">
              <div>
                <strong>这次正文的图片池</strong>
                <span>
                  {{ currentRecordImageAssets.length ? `已抓取 ${currentRecordImageAssets.length} 张，点击后大图查看` : "确认正文并抓图后，可在这里统一查看" }}
                </span>
              </div>
              <button class="ghost-btn media-entry-btn" :disabled="!currentRecordImageAssets.length" @click="openConfirmImagePool">
                查看这次正文的图片池
              </button>
            </div>

            <div class="retry-extract-section">
              <label class="field">
                <span>补充提示词后重新提取</span>
                <textarea
                  v-model="extractPromptInput"
                  rows="3"
                  placeholder="例如：只保留新闻正文，不要评论区和相关推荐。"
                />
              </label>
              <button class="ghost-btn" :disabled="busy" @click="retryExtract">基于提示词重新提取</button>
              <p class="hint">页面未登录、未加载完整或抓到空白内容时，请先手动处理页面，再点击"重新执行当前正文"。</p>
            </div>
          </template>
        </div>
      </section>

      <section class="content-panel full-height-panel">
        <div class="panel-header">
          <div>
            <span class="eyebrow">Compose</span>
            <h2>二次原创区</h2>
          </div>
          <div class="header-meta">
            <span>已确认 {{ confirmedRecords }} 条正文</span>
            <span>已勾选 {{ rewriteSelectedRecordIds.length }} 条正文</span>
          </div>
        </div>

        <div v-if="!activeTask" class="empty-state">创建任务并抓取正文后，这里可以勾选需要参与二次原创的正文。</div>
        <div v-else class="rewrite-result">
          <div class="selection-shell">
            <div class="history-header">
              <strong>勾选需要参与二次原创的正文</strong>
              <span>{{ rewriteCandidateRecords.length }} 条可用</span>
            </div>
            <div v-if="!rewriteCandidateRecords.length" class="empty-note">先在左侧确认正文，这里才会出现可勾选的正文。</div>
            <div v-else class="compose-record-list">
              <label v-for="record in rewriteCandidateRecords" :key="record.recordId" class="compose-record-card">
                <div class="compose-record-top">
                  <input
                    :checked="rewriteSelectedRecordIds.includes(record.recordId)"
                    type="checkbox"
                    @change="toggleRewriteRecord(record.recordId, ($event.target as HTMLInputElement).checked)"
                  />
                  <div>
                    <strong>{{ record.title || summarizeUrl(record.sourceUrl, 44) }}</strong>
                    <span>{{ summarizeUrl(record.sourceUrl, 72) }}</span>
                  </div>
                </div>
                <p>{{ summarizeBody(record.userEditedBody) }}</p>
              </label>
            </div>
          </div>

          <label class="field">
            <span>追加到系统提示词</span>
            <textarea
              v-model="rewritePromptInput"
              rows="4"
              placeholder="例如：用更强的信息差开头，控制在 800 字内。"
            />
          </label>

          <div class="action-row">
            <button class="primary-btn" :disabled="busy || !activeTask" @click="rewriteTask">开始二次原创</button>
            <button class="ghost-btn" :disabled="!activeTask?.rewriteResult" @click="openRewriteResult">查看结果</button>
          </div>

          <div v-if="activeTask?.rewriteResult" class="result-brief">
            <strong>{{ activeTask.rewriteResult.title }}</strong>
            <span>结果编辑、插图、本地上传、保存和导出都在“查看结果”的大弹窗里完成。</span>
          </div>
          <div v-else class="empty-note">当前任务还没有原创结果。</div>
        </div>
      </section>
    </main>

    <div v-if="errorMessage" class="error-toast">{{ errorMessage }}</div>

    <div v-if="historyRecordsOpen" class="modal-backdrop history-records-backdrop" @click.self="closeHistoryRecords">
      <section class="history-records-modal">
        <div class="panel-header history-records-header">
          <div>
            <span class="eyebrow">History</span>
            <h2>当前任务历史正文</h2>
          </div>
          <div class="header-meta">
            <span>{{ historyRecords.length }} 条记录</span>
          </div>
        </div>

        <button class="ghost-btn modal-close-btn" @click="closeHistoryRecords">关闭</button>

        <div v-if="viewingRecordImagePool" class="image-pool-view">
          <div class="image-pool-toolbar">
            <button class="ghost-btn" @click="closeRecordImagePool">返回列表</button>
            <button
              class="ghost-btn delete-images-btn"
              :disabled="selectedImageAssetIds.length === 0 || busy"
              @click="deleteSelectedImages"
            >
              删除选中 ({{ selectedImageAssetIds.length }})
            </button>
          </div>
          <div v-if="!viewingRecordImageAssets.length" class="empty-note">该记录暂无图片</div>
          <div v-else class="asset-grid image-pool-grid">
            <article
              v-for="asset in viewingRecordImageAssets"
              :key="asset.assetId"
              class="asset-card selectable-card"
              :class="{ selected: selectedImageAssetIds.includes(asset.assetId) }"
              @click="toggleImageAssetSelection(asset.assetId, !selectedImageAssetIds.includes(asset.assetId))"
            >
              <div class="selection-indicator">
                <input
                  type="checkbox"
                  :checked="selectedImageAssetIds.includes(asset.assetId)"
                  @click.stop
                  @change="toggleImageAssetSelection(asset.assetId, ($event.target as HTMLInputElement).checked)"
                />
              </div>
              <img v-if="asset.localPath && imageUrlsByPath[asset.localPath]" :src="imageUrlsByPath[asset.localPath]" :alt="asset.sourceUrl" />
              <div v-else class="asset-placeholder">图片预览不可用</div>
              <div class="asset-meta">
                <strong>{{ asset.failedReason ? "下载失败" : summarizeUrl(asset.sourceUrl, 42) }}</strong>
                <span>{{ asset.failedReason ? asset.failedReason : summarizeUrl(asset.sourceUrl, 72) }}</span>
              </div>
            </article>
          </div>
        </div>

        <div v-else class="history-records-list">
          <div v-if="!historyRecords.length" class="empty-note">暂无历史正文记录</div>
          <div v-else class="record-list">
            <div
              v-for="record in historyRecords"
              :key="record.recordId"
              class="record-card"
              :class="{ active: currentRecord?.recordId === record.recordId, editing: editingRecordId === record.recordId }"
            >
              <div v-if="editingRecordId === record.recordId" class="record-edit-form">
                <label class="field">
                  <span>标题</span>
                  <input v-model="editingRecordTitle" type="text" placeholder="输入标题" />
                </label>
                <label class="field">
                  <span>正文内容</span>
                  <textarea v-model="editingRecordBody" rows="6" placeholder="输入正文内容" />
                </label>
                <div class="record-edit-actions">
                  <button class="primary-btn small-btn" :disabled="busy" @click="saveEditingRecord(record.recordId)">保存</button>
                  <button class="ghost-btn small-btn" @click="cancelEditingRecord">取消</button>
                </div>
              </div>
              <template v-else>
                <button class="record-card-main" @click="selectedRecordId = record.recordId; closeHistoryRecords()">
                  <div class="record-card-top">
                    <strong>{{ record.title || summarizeUrl(record.sourceUrl, 44) }}</strong>
                    <span>{{ formatDateTime(record.lastRunAt) }}</span>
                  </div>
                  <span>{{ summarizeUrl(record.sourceUrl, 72) }}</span>
                  <p>{{ summarizeBody(record.userEditedBody || record.extractedBody) }}</p>
                  <div class="record-card-meta">
                    <span>{{ record.status }}</span>
                    <span>重跑 {{ record.rerunCount }} 次</span>
                    <span>{{ record.imageAssetIds.length }} 张图</span>
                  </div>
                </button>
                <div class="record-card-actions">
                  <button class="ghost-btn small-btn" @click.stop="startEditingRecord(record)">编辑</button>
                  <button class="ghost-btn small-btn" @click.stop="openRecordImagePool(record.recordId)">图片池</button>
                  <button class="ghost-btn small-btn delete-record-btn" :disabled="busy" @click.stop="deleteRecord(record.recordId)">删除</button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="taskListModalOpen" class="modal-backdrop task-list-backdrop" @click.self="taskListModalOpen = false">
      <section class="task-list-modal">
        <div class="panel-header task-list-header">
          <div>
            <span class="eyebrow">Tasks</span>
            <h2>所有任务</h2>
          </div>
          <div class="header-meta">
            <span>{{ taskList.length }} 个任务</span>
          </div>
        </div>

        <button class="ghost-btn modal-close-btn" @click="taskListModalOpen = false">关闭</button>

        <div v-if="!taskList.length" class="empty-note">暂无任务</div>
        <div v-else class="task-list-modal-list">
          <div
            v-for="task in taskList"
            :key="task.taskId"
            class="task-list-modal-item"
            :class="{ active: activeTask?.taskId === task.taskId }"
          >
            <div v-if="editingTaskId === task.taskId" class="task-edit-form">
              <input v-model="editingTaskTitle" type="text" placeholder="输入任务名称" @keyup.enter="saveEditingTask(task.taskId)" />
              <div class="task-edit-actions">
                <button class="primary-btn small-btn" :disabled="busy" @click="saveEditingTask(task.taskId)">保存</button>
                <button class="ghost-btn small-btn" @click="editingTaskId = null">取消</button>
              </div>
            </div>
            <template v-else>
              <button class="task-list-modal-item-main" @click="openTask(task.taskId); taskListModalOpen = false">
                <strong>{{ task.title }}</strong>
                <span>{{ task.recordCount }} 条链接 · {{ task.status }}</span>
              </button>
              <div class="task-list-modal-item-actions">
                <button class="ghost-btn small-btn" @click.stop="startEditingTask(task)">编辑</button>
                <button class="ghost-btn small-btn delete-task-btn" :disabled="busy" @click.stop="deleteTask(task.taskId)">删除</button>
              </div>
            </template>
          </div>
        </div>
      </section>
    </div>

    <div v-if="confirmImagePoolOpen" class="modal-backdrop" @click.self="closeConfirmImagePool">
      <section class="image-pool-modal">
        <div class="panel-header image-pool-header">
          <div>
            <span class="eyebrow">Assets</span>
            <h2>这次正文的图片池</h2>
          </div>
          <div class="header-meta">
            <span>{{ currentRecordImageAssets.length }} 张素材</span>
            <span>{{ currentRecord?.title || "当前正文" }}</span>
          </div>
        </div>

        <button class="ghost-btn modal-close-btn" @click="closeConfirmImagePool">关闭</button>

        <div class="asset-grid image-pool-grid">
          <article v-for="asset in currentRecordImageAssets" :key="asset.assetId" class="asset-card preview-only-card">
            <img v-if="asset.localPath && imageUrlsByPath[asset.localPath]" :src="imageUrlsByPath[asset.localPath]" :alt="asset.sourceUrl" />
            <div v-else class="asset-placeholder">图片预览不可用</div>
            <div class="asset-meta">
              <strong>{{ asset.failedReason ? "下载失败" : summarizeUrl(asset.sourceUrl, 42) }}</strong>
              <span>{{ asset.failedReason ? asset.failedReason : summarizeUrl(asset.sourceUrl, 72) }}</span>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div v-if="rewriteResultOpen && rewriteDraft" class="modal-backdrop result-backdrop" @click.self="closeRewriteResult">
      <section class="result-modal">
        <div class="panel-header result-header">
          <div>
            <span class="eyebrow">Result</span>
            <h2>二次原创结果</h2>
          </div>
          <div class="header-meta">
            <span>本次使用 {{ rewriteDraft.sourceRecordIds.length }} 条正文</span>
            <span>{{ rewriteSourceImageAssets.length }} 张可插入图片</span>
          </div>
        </div>

        <div class="result-toolbar">
          <button class="primary-btn toolbar-btn" :disabled="rewriteSaveBusy" @click="saveRewriteResult">
            {{ rewriteSaveBusy ? "保存中..." : "保存" }}
          </button>
          <button class="ghost-btn toolbar-btn" :disabled="exportBusy" @click="exportRewriteResult">
            {{ exportBusy ? "导出中..." : "导出 Word" }}
          </button>
          <button class="ghost-btn toolbar-btn" @click="closeRewriteResult">关闭</button>
        </div>

        <div class="result-body">
          <div class="result-editor">
            <label class="field">
              <span>标题</span>
              <input :value="rewriteDraft.title" type="text" @input="updateRewriteTitle(($event.target as HTMLInputElement).value)" />
            </label>

            <div class="paragraph-list">
              <article v-for="(block, index) in rewriteParagraphBlocks" :key="block.blockId" class="paragraph-card">
                <div class="paragraph-top">
                  <strong>第 {{ index + 1 }} 段</strong>
                  <div class="paragraph-actions">
                    <button class="ghost-btn small-btn" @click="openImagePicker(block.sectionId)">从图片池插图</button>
                    <button class="ghost-btn small-btn" :disabled="selectingUploadImage" @click="imagePickerSectionId = block.sectionId; uploadImageToSection()">
                      上传本地图片
                    </button>
                  </div>
                </div>

                <textarea
                  class="paragraph-editor"
                  :value="block.text"
                  rows="6"
                  @input="updateParagraphText(block.blockId, ($event.target as HTMLTextAreaElement).value)"
                />

                <div v-if="getSectionImages(block.sectionId).length" class="inline-image-list">
                  <article v-for="imageBlock in getSectionImages(block.sectionId)" :key="imageBlock.blockId" class="inline-image-card">
                    <img v-if="imageUrlsByPath[imageBlock.imagePath]" :src="imageUrlsByPath[imageBlock.imagePath]" :alt="imageBlock.caption || imageBlock.imagePath" />
                    <div v-else class="asset-placeholder">图片预览不可用</div>
                    <div class="asset-meta">
                      <strong>{{ imageBlock.caption || "插图" }}</strong>
                      <span>{{ summarizeUrl(imageBlock.imagePath, 64) }}</span>
                    </div>
                    <button class="ghost-btn small-btn remove-btn" @click="removeImageBlock(imageBlock.blockId)">移除图片</button>
                  </article>
                </div>
              </article>
            </div>
          </div>

          <aside class="picker-panel">
            <div class="history-header">
              <strong>{{ imagePickerSectionId ? "本次正文图片池" : "选择段落后可插图" }}</strong>
              <span>{{ rewriteSourceImageAssets.length }} 张</span>
            </div>
            <p class="hint">这里只显示本次参与原创的正文对应图片池，也可以直接上传本地图片插入到当前段落后面。</p>
            <div class="picker-actions">
              <button class="ghost-btn" :disabled="!imagePickerSectionId || selectingUploadImage" @click="uploadImageToSection">
                {{ selectingUploadImage ? "选择中..." : "上传本地图片" }}
              </button>
              <button class="ghost-btn" :disabled="!imagePickerSectionId" @click="closeImagePicker">收起图片池</button>
            </div>
            <div v-if="!rewriteSourceImageAssets.length" class="empty-note">当前这次原创还没有可用图片素材。</div>
            <div v-else class="picker-grid">
              <article v-for="asset in rewriteSourceImageAssets" :key="asset.assetId" class="asset-card picker-card">
                <img v-if="asset.localPath && imageUrlsByPath[asset.localPath]" :src="imageUrlsByPath[asset.localPath]" :alt="asset.sourceUrl" />
                <div v-else class="asset-placeholder">图片预览不可用</div>
                <div class="asset-meta">
                  <strong>{{ asset.failedReason ? "下载失败" : summarizeUrl(asset.sourceUrl, 42) }}</strong>
                  <span>{{ asset.failedReason ? asset.failedReason : summarizeUrl(asset.sourceUrl, 72) }}</span>
                </div>
                <button
                  class="primary-btn small-insert-btn"
                  :disabled="!imagePickerSectionId || !asset.localPath"
                  @click="insertRecordImage(asset)"
                >
                  插入当前段后
                </button>
              </article>
            </div>
          </aside>
        </div>
      </section>
    </div>

    <AppSettingsModal
      :open="settingsOpen"
      :settings="appSettings"
      :saving="settingsSaving"
      @close="settingsOpen = false"
      @browse="browseWorkspaceDir"
      @save="saveSettings"
    />

    <WebToPostSettingsModal
      :open="toolSettingsOpen"
      :settings="toolSettings"
      :saving="toolSettingsSaving"
      @close="toolSettingsOpen = false"
      @save="saveToolSettings"
    />
  </section>
</template>

<style scoped>
.web-page {
  height: 100%;
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 22px;
  padding: 24px 28px 28px;
}

.sidebar {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 14px;
  overflow: auto;
}

.main-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr);
  gap: 18px;
}

.content-panel,
.panel {
  padding: 18px;
  border-radius: 20px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
}

.content-panel {
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.full-height-panel {
  min-height: 0;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.eyebrow,
.label {
  display: block;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #79c8ff;
}

.task-list,
.stack-actions,
.header-meta {
  display: grid;
  gap: 8px;
}

.header-meta {
  min-width: 0;
  text-align: right;
}

.header-meta span,
.subtle,
small,
.hint {
  color: #96add1;
  line-height: 1.6;
  font-size: 12px;
}

.header-meta span {
  max-width: 360px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-text {
  line-height: 1.6;
}

.task-item,
.record-card,
.ghost-btn,
.primary-btn {
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  cursor: pointer;
  font-weight: 600;
}

.task-item,
.record-card,
.ghost-btn {
  background: rgba(255, 255, 255, 0.03);
  color: #edf5ff;
}

.task-item {
  padding: 12px 14px;
  text-align: left;
}

.task-item strong,
.task-item span {
  display: block;
}

.task-item span {
  margin-top: 6px;
  color: #9cb3d7;
  font-size: 12px;
  font-weight: 400;
}

.task-item.active,
.record-card.active {
  border-color: rgba(108, 174, 255, 0.46);
}

.primary-btn {
  background: linear-gradient(135deg, #79f0d5, #47b9ff);
  color: #08111f;
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.field {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}

.field span {
  color: #9db4d8;
  font-size: 12px;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #9cb3d7;
  font-size: 12px;
}

.toggle-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.auto-url-list {
  display: grid;
  gap: 8px;
}

.auto-url-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

input,
textarea {
  width: 100%;
  border: 1px solid rgba(149, 181, 255, 0.16);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: #edf5ff;
  padding: 14px 16px;
  outline: none;
}

textarea {
  resize: vertical;
  line-height: 1.7;
}

.editor-shell,
.rewrite-result,
.empty-state,
.empty-note,
.asset-grid {
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.editor-shell,
.rewrite-result {
  display: grid;
  gap: 14px;
}

.history-shell,
.selection-shell,
.result-brief {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
}

.history-header,
.record-card-top,
.record-card-meta,
.compose-record-top,
.result-toolbar,
.paragraph-top,
.paragraph-actions,
.picker-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.record-list,
.compose-record-list,
.paragraph-list,
.inline-image-list,
.picker-grid {
  display: grid;
  gap: 12px;
}

.record-card,
.compose-record-card,
.paragraph-card,
.inline-image-card,
.picker-card {
  padding: 12px 14px;
}

.record-card {
  text-align: left;
  display: grid;
  gap: 8px;
}

.record-card-main {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.delete-record-btn {
  width: auto;
  justify-self: end;
  color: #ff8a8a;
  border-color: rgba(255, 106, 106, 0.22);
}

.history-shell.compact {
  padding: 12px;
}

.record-list-preview {
  display: grid;
  gap: 8px;
}

.record-preview-item {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  font-size: 13px;
  color: #edf5ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.record-preview-item:hover {
  border-color: rgba(108, 174, 255, 0.46);
}

.record-preview-item.active {
  border-color: rgba(108, 174, 255, 0.46);
  background: rgba(108, 174, 255, 0.08);
}

.more-records-hint {
  color: #9cb3d7;
  font-size: 12px;
  text-align: center;
  padding: 4px;
}

.field-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.field-actions .primary-btn,
.field-actions .ghost-btn {
  width: auto;
}

.body-content-card {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}

.body-content-card .field-label {
  color: #9db4d8;
  font-size: 12px;
}

.body-content-card textarea {
  min-height: 200px;
  resize: vertical;
  width: 100%;
  border: 1px solid rgba(149, 181, 255, 0.16);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: #edf5ff;
  padding: 14px 16px;
  outline: none;
  line-height: 1.7;
}

.retry-extract-section {
  margin-top: 16px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(149, 181, 255, 0.12);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.retry-extract-section .ghost-btn {
  width: auto;
}

.retry-extract-section .field {
  margin-bottom: 0;
  width: 100%;
}

.history-records-modal {
  width: min(900px, 100%);
  max-height: min(88vh, 800px);
  display: grid;
  gap: 16px;
  padding: 24px;
  border-radius: 24px;
  border: 1px solid rgba(140, 173, 247, 0.2);
  background: linear-gradient(180deg, rgba(11, 17, 32, 0.96), rgba(8, 14, 28, 0.98));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
  grid-template-rows: auto auto minmax(0, 1fr);
}

.history-records-header {
  margin-bottom: 0;
}

.history-records-list {
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.record-card-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.record-card-actions .small-btn {
  width: auto;
  min-height: 32px;
  padding: 4px 12px;
  font-size: 12px;
}

.record-edit-form {
  display: grid;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(149, 181, 255, 0.12);
}

.record-edit-form .field {
  margin-bottom: 0;
}

.record-edit-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.image-pool-view {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 16px;
}

.image-pool-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.delete-images-btn {
  color: #ff8a8a;
  border-color: rgba(255, 106, 106, 0.22);
}

.selectable-card {
  position: relative;
  cursor: pointer;
  transition: all 0.2s;
}

.selectable-card:hover {
  border-color: rgba(108, 174, 255, 0.3);
}

.selectable-card.selected {
  border-color: rgba(108, 174, 255, 0.6);
  background: rgba(108, 174, 255, 0.08);
}

.selection-indicator {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
}

.selection-indicator input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.view-all-tasks-btn {
  width: 100%;
  margin-top: 8px;
  font-size: 12px;
  padding: 6px 10px;
}

.view-all-tasks-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.task-list-modal {
  width: min(500px, 100%);
  max-height: min(88vh, 800px);
  display: grid;
  gap: 16px;
  padding: 24px;
  border-radius: 24px;
  border: 1px solid rgba(140, 173, 247, 0.2);
  background: linear-gradient(180deg, rgba(11, 17, 32, 0.96), rgba(8, 14, 28, 0.98));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
  grid-template-rows: auto auto minmax(0, 1fr);
}

.task-list-header {
  margin-bottom: 0;
}

.task-list-modal-list {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 10px;
  padding-right: 4px;
}

.task-list-modal-item {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
  display: grid;
  gap: 8px;
}

.task-list-modal-item.active {
  border-color: rgba(108, 174, 255, 0.46);
  background: rgba(108, 174, 255, 0.08);
}

.task-list-modal-item-main {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  display: grid;
  gap: 4px;
}

.task-list-modal-item-main strong {
  color: #edf5ff;
}

.task-list-modal-item-main span {
  color: #9cb3d7;
  font-size: 12px;
}

.task-list-modal-item-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.task-list-modal-item-actions .small-btn {
  width: auto;
  min-height: 32px;
  padding: 4px 12px;
  font-size: 12px;
}

.delete-task-btn {
  color: #ff8a8a;
  border-color: rgba(255, 106, 106, 0.22);
}

.task-edit-form {
  display: grid;
  gap: 10px;
}

.task-edit-form input {
  width: 100%;
  border: 1px solid rgba(149, 181, 255, 0.16);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: #edf5ff;
  padding: 10px 14px;
  outline: none;
}

.task-edit-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.record-card strong,
.compose-record-card strong,
.result-brief strong,
.paragraph-card strong,
.inline-image-card strong {
  color: #edf5ff;
}

.record-card span,
.record-card p,
.compose-record-card span,
.compose-record-card p,
.result-brief span {
  color: #9cb3d7;
  font-size: 12px;
  line-height: 1.6;
}

.record-card p,
.compose-record-card p {
  margin: 8px 0 0;
}

.record-card-meta {
  margin-top: 10px;
  justify-content: flex-start;
  flex-wrap: wrap;
}

.inline-media-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
}

.inline-media-entry strong,
.inline-media-entry span {
  display: block;
}

.inline-media-entry strong {
  margin-bottom: 4px;
  color: #edf5ff;
}

.inline-media-entry span {
  color: #8fa8cf;
  font-size: 12px;
  line-height: 1.6;
}

.media-entry-btn {
  width: auto;
  min-width: 220px;
}

.compose-record-card {
  display: grid;
  gap: 8px;
  border-radius: 16px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
}

.compose-record-top {
  align-items: flex-start;
  justify-content: flex-start;
}

.compose-record-top input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
}

.asset-grid,
.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 12px;
  align-content: start;
}

.asset-card {
  display: grid;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.025);
}

.preview-only-card {
  padding: 10px;
}

.asset-card img,
.asset-placeholder {
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: 180px;
  border-radius: 12px;
  object-fit: cover;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.03);
  color: #90a7cb;
}

.asset-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.asset-meta strong {
  font-size: 12px;
  color: #edf5ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-meta span {
  font-size: 11px;
  color: #8fa8cf;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.empty-state,
.empty-note {
  color: #9cb3d7;
  line-height: 1.7;
}

.error-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 30;
  max-width: 420px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 106, 106, 0.22);
  background: rgba(255, 106, 106, 0.12);
  color: #ffdcdc;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 32px;
  background: rgba(6, 11, 20, 0.72);
  backdrop-filter: blur(10px);
}

.image-pool-modal,
.result-modal {
  width: min(1280px, 100%);
  max-height: min(88vh, 980px);
  display: grid;
  gap: 16px;
  padding: 24px;
  border-radius: 24px;
  border: 1px solid rgba(140, 173, 247, 0.2);
  background: linear-gradient(180deg, rgba(11, 17, 32, 0.96), rgba(8, 14, 28, 0.98));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
}

.image-pool-modal {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.result-modal {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.image-pool-header,
.result-header {
  margin-bottom: 0;
}

.modal-close-btn,
.toolbar-btn,
.small-btn,
.small-insert-btn {
  width: auto;
}

.result-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.95fr);
  gap: 18px;
}

.result-editor,
.picker-panel {
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.picker-panel {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.paragraph-card,
.inline-image-card {
  display: grid;
  gap: 12px;
  border-radius: 18px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.025);
}

.paragraph-editor {
  min-height: 140px;
}

.inline-image-list {
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}

.inline-image-card {
  align-content: start;
}

.remove-btn,
.small-insert-btn {
  justify-self: start;
}

@media (max-width: 1280px) {
  .web-page {
    grid-template-columns: 1fr;
  }

  .main-grid {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(2, minmax(320px, 1fr));
  }

  .header-meta {
    text-align: left;
  }

  .header-meta span {
    max-width: none;
  }

  .inline-media-entry,
  .result-body,
  .result-toolbar,
  .paragraph-top,
  .paragraph-actions,
  .picker-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .media-entry-btn,
  .modal-close-btn,
  .toolbar-btn,
  .small-btn,
  .small-insert-btn {
    width: 100%;
  }

  .modal-backdrop {
    padding: 18px;
  }

  .image-pool-modal,
  .result-modal {
    max-height: 92vh;
    padding: 18px;
  }

  .result-body {
    grid-template-columns: 1fr;
  }
}
</style>
