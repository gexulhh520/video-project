<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type {
  ContentStudioConfigStatus,
  ContentStudioMaterialPack,
  ContentStudioMaterialProgress,
  ContentStudioModelRole,
  ContentStudioParagraphImagePlanUpdate,
  ContentStudioSettings,
  ContentStudioTask,
  ContentStudioTopicProgress,
  ContentStudioTabKey,
  ContentStudioTabModelSettings,
  OpenCliProvider,
  MaterialRewriteInput,
  TopicCreateInput
} from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";
import ContentStudioSettingsModal from "../components/content-studio/ContentStudioSettingsModal.vue";
import TopicCreateTab from "../components/content-studio/TopicCreateTab.vue";
import TopicAdvancedSettingsModal from "../components/content-studio/TopicAdvancedSettingsModal.vue";
import MaterialRewriteTab from "../components/content-studio/MaterialRewriteTab.vue";
import MaterialSourceModal from "../components/content-studio/MaterialSourceModal.vue";
import HotCreateTab from "../components/content-studio/HotCreateTab.vue";
import LayoutTab from "../components/content-studio/LayoutTab.vue";
import ArticlePickerModal from "../components/content-studio/ArticlePickerModal.vue";
import TaskHistoryModal from "../components/content-studio/TaskHistoryModal.vue";
import ImagePlanModal from "../components/content-studio/ImagePlanModal.vue";
import ImageAssetModal from "../components/content-studio/ImageAssetModal.vue";
import PublishPreviewDrawer from "../components/content-studio/PublishPreviewDrawer.vue";
import PublishDraftFallbackModal from "../components/content-studio/PublishDraftFallbackModal.vue";
import TabModelSettingsModal from "../components/content-studio/TabModelSettingsModal.vue";
import StudioResultDrawer from "../components/content-studio/StudioResultDrawer.vue";
import RunLogModal from "../components/content-studio/RunLogModal.vue";

const router = useRouter();

const tabs: Array<{ key: ContentStudioTabKey; label: string }> = [
  { key: "topic", label: "话题成文" },
  { key: "material", label: "素材二创" },
  { key: "hot", label: "热点成文" },
  { key: "layout", label: "图文排版" }
];

const activeTab = ref<ContentStudioTabKey>("topic");
const modelSettingsTab = ref<ContentStudioTabKey>("topic");
const settings = ref<ContentStudioSettings | null>(null);
const configStatus = ref<ContentStudioConfigStatus | null>(null);
const loading = ref(false);
const savingGlobal = ref(false);
const savingTab = ref(false);
const globalModalOpen = ref(false);
const tabModelModalOpen = ref(false);
const runLogOpen = ref(false);
const taskHistoryOpen = ref(false);
const resultDrawerOpen = ref(false);
const topicAdvancedModalOpen = ref(false);
const materialSourceModalOpen = ref(false);
const runLogTitle = ref("运行记录");
const runLogDescription = ref("阶段 1 已预留运行记录弹窗入口，后续阶段会接入任务历史与详细日志。");
const testingRole = ref<ContentStudioModelRole | null>(null);
const testMessage = ref("");
const pageNotice = ref("");
const topicRunning = ref(false);
const latestTopicTask = ref<ContentStudioTask | null>(null);
const layoutArticlePickerOpen = ref(false);
const layoutArticleLoading = ref(false);
const layoutSelectingTaskId = ref<string | null>(null);
const layoutArticleCandidates = ref<ContentStudioTask[]>([]);
const layoutSelectedTask = ref<ContentStudioTask | null>(null);
const imagePlanModalOpen = ref(false);
const imagePlanSaving = ref(false);
const imageAssetModalOpen = ref(false);
const imageAssetSaving = ref(false);
const copyingPublishDraft = ref(false);
const publishPreviewOpen = ref(false);
const imagePreviewMap = ref<Record<string, string>>({});
const publishDraftFallbackOpen = ref(false);
const publishDraftFallbackText = ref("");
const exportingWord = ref(false);
const exportingImages = ref(false);
const taskHistoryLoading = ref(false);
const taskHistoryDeletingTaskId = ref<string | null>(null);
const taskHistoryPage = ref(1);
const taskHistoryPageSize = 8;
const taskHistoryActiveTab = ref<ContentStudioTabKey>("topic");
const topicTaskSummaries = ref<Array<{
  taskId: string;
  tab: ContentStudioTabKey;
  title: string;
  status: "idle" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
}>>([]);
const topicProgress = ref<ContentStudioTopicProgress | null>(null);
const materialProgress = ref<ContentStudioMaterialProgress | null>(null);
const materialRunning = ref(false);
const materialPack = ref<ContentStudioMaterialPack>({ sources: [] });
const materialSourceBusy = ref(false);
const latestMaterialTask = ref<ContentStudioTask | null>(null);
const topicAdvancedSettings = ref({
  reviewRounds: 2,
  targetReader: "",
  writingStyle: "",
  wordRange: "1200-1800字",
  generateTitleCandidates: true,
  generateCoverText: true,
  generateImagePlan: true
});
const recentResultTask = computed(() => (activeTab.value === "material" ? latestMaterialTask.value : latestTopicTask.value));

const currentTabStatus = computed(() => {
  if (!configStatus.value) {
    return { ready: false, missingItems: [] };
  }
  return configStatus.value.tabs[activeTab.value];
});

const currentModelSettings = computed<ContentStudioTabModelSettings | null>(() => {
  if (!settings.value) {
    return null;
  }
  return settings.value.tabs[modelSettingsTab.value];
});

let unsubscribeTopicProgress: (() => void) | null = null;
let unsubscribeMaterialProgress: (() => void) | null = null;

onMounted(() => {
  unsubscribeTopicProgress = desktopApi.onContentStudioTopicProgress((progress) => {
    topicProgress.value = progress;
  });
  unsubscribeMaterialProgress = desktopApi.onContentStudioMaterialProgress((progress) => {
    materialProgress.value = progress;
  });
  void bootstrap();
});

onBeforeUnmount(() => {
  unsubscribeTopicProgress?.();
  unsubscribeMaterialProgress?.();
});

async function bootstrap(): Promise<void> {
  loading.value = true;
  try {
    await Promise.all([loadSettings(), loadStatus()]);
  } finally {
    loading.value = false;
  }
}

async function loadSettings(): Promise<void> {
  settings.value = await desktopApi.getContentStudioSettings();
}

async function loadStatus(): Promise<void> {
  configStatus.value = await desktopApi.getContentStudioConfigStatus();
}

function openGlobalSettings(): void {
  globalModalOpen.value = true;
}

function openModelSettings(tab?: ContentStudioTabKey): void {
  modelSettingsTab.value = tab ?? activeTab.value;
  testMessage.value = "";
  tabModelModalOpen.value = true;
}

async function saveGlobalSettings(nextSettings: ContentStudioSettings): Promise<void> {
  savingGlobal.value = true;
  try {
    settings.value = await desktopApi.saveContentStudioSettings(nextSettings);
    await loadStatus();
    globalModalOpen.value = false;
    pageNotice.value = "内容创作工作台全局配置已保存。";
  } finally {
    savingGlobal.value = false;
  }
}

async function saveTabSettings(nextTabSettings: ContentStudioTabModelSettings): Promise<void> {
  if (!settings.value) {
    return;
  }

  savingTab.value = true;
  try {
    const nextSettings: ContentStudioSettings = {
      ...settings.value,
      tabs: {
        ...settings.value.tabs,
        [modelSettingsTab.value]: nextTabSettings
      }
    };

    settings.value = await desktopApi.saveContentStudioSettings(nextSettings);
    await loadStatus();
    tabModelModalOpen.value = false;
    pageNotice.value = `${tabs.find((tab) => tab.key === modelSettingsTab.value)?.label || "当前"}配置已保存。`;
  } finally {
    savingTab.value = false;
  }
}

async function testTabModel(role: ContentStudioModelRole, provider: OpenCliProvider, profile: string): Promise<void> {
  testingRole.value = role;
  testMessage.value = "";

  try {
    const result = await desktopApi.testContentStudioModel({
      tab: modelSettingsTab.value,
      role,
      provider,
      profile
    });
    testMessage.value = result.message;
  } catch (error) {
    testMessage.value = error instanceof Error ? error.message : "模型测试失败";
  } finally {
    testingRole.value = null;
  }
}

function goHome(): void {
  void router.push("/");
}

async function openTaskHistory(): Promise<void> {
  taskHistoryOpen.value = true;
  taskHistoryActiveTab.value = activeTab.value === "material" ? "material" : "topic";
  taskHistoryPage.value = 1;
  await loadTopicTaskSummaries();
}

async function loadTopicTaskSummaries(): Promise<void> {
  taskHistoryLoading.value = true;
  try {
    const tasks = await desktopApi.listContentStudioTasks();
    topicTaskSummaries.value = tasks
      .filter((task) => task.tab === taskHistoryActiveTab.value)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    taskHistoryLoading.value = false;
  }
}

function changeTaskHistoryPage(nextPage: number): void {
  const maxPage = Math.max(1, Math.ceil(topicTaskSummaries.value.length / taskHistoryPageSize));
  taskHistoryPage.value = Math.min(maxPage, Math.max(1, nextPage));
}

async function openTaskFromHistory(taskId: string): Promise<void> {
  const task = await desktopApi.getContentStudioTaskById(taskId);
  latestTopicTask.value = task;
  runLogTitle.value = task.tab === "material" ? "素材二创 - 运行记录" : "话题成文 - 运行记录";
  runLogDescription.value = formatRunLogDescription(task);
  resultDrawerOpen.value = true;
  taskHistoryOpen.value = false;
}

async function changeTaskHistoryTab(tab: ContentStudioTabKey): Promise<void> {
  taskHistoryActiveTab.value = tab === "material" ? "material" : "topic";
  taskHistoryPage.value = 1;
  await loadTopicTaskSummaries();
}

async function deleteTaskFromHistory(taskId: string): Promise<void> {
  const confirmed = window.confirm("确认删除这条历史任务吗？删除后不可恢复。");
  if (!confirmed) {
    return;
  }
  taskHistoryDeletingTaskId.value = taskId;
  try {
    await desktopApi.deleteContentStudioTask(taskId);
    if (latestTopicTask.value?.taskId === taskId) {
      latestTopicTask.value = null;
    }
    await loadTopicTaskSummaries();
    const maxPage = Math.max(1, Math.ceil(topicTaskSummaries.value.length / taskHistoryPageSize));
    if (taskHistoryPage.value > maxPage) {
      taskHistoryPage.value = maxPage;
    }
    pageNotice.value = "历史任务已删除。";
  } finally {
    taskHistoryDeletingTaskId.value = null;
  }
}

async function setActiveTab(tab: ContentStudioTabKey): Promise<void> {
  activeTab.value = tab;
  if (tab === "layout") {
    await loadLayoutArticleCandidates();
  }
}

async function loadLayoutArticleCandidates(): Promise<void> {
  layoutArticleLoading.value = true;
  try {
    const tasks = await desktopApi.listContentStudioTasks();
    const candidateSummaries = tasks.filter((task) => task.tab === "topic" && task.status === "completed");
    const candidateTasks = await Promise.all(
      candidateSummaries.map((task) => desktopApi.getContentStudioTaskById(task.taskId))
    );
    layoutArticleCandidates.value = candidateTasks
      .filter((task) => task.result && task.result.paragraphs.length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    layoutArticleLoading.value = false;
  }
}

async function openLayoutArticlePicker(): Promise<void> {
  if (!layoutArticleCandidates.value.length) {
    await loadLayoutArticleCandidates();
  }
  layoutArticlePickerOpen.value = true;
}

async function selectLayoutArticle(taskId: string): Promise<void> {
  layoutSelectingTaskId.value = taskId;
  try {
    layoutSelectedTask.value = await desktopApi.getContentStudioTaskById(taskId);
    await loadImagePreviews();
    layoutArticlePickerOpen.value = false;
    pageNotice.value = "图文编排文章已切换。";
  } finally {
    layoutSelectingTaskId.value = null;
  }
}

async function loadImagePreviews(): Promise<void> {
  const task = layoutSelectedTask.value;
  if (!task?.imageAssets.length) {
    imagePreviewMap.value = {};
    return;
  }
  const pairs = await Promise.all(
    task.imageAssets.map(async (asset) => {
      try {
        const dataUrl = await desktopApi.readImageAsDataUrl(asset.localPath);
        return [asset.assetId, dataUrl] as const;
      } catch {
        return [asset.assetId, ""] as const;
      }
    })
  );
  imagePreviewMap.value = Object.fromEntries(pairs.filter((item) => item[1]));
}

function openImagePlanModal(): void {
  if (!layoutSelectedTask.value) {
    pageNotice.value = "请先选择文章。";
    return;
  }
  imagePlanModalOpen.value = true;
}

async function saveImagePlan(updates: ContentStudioParagraphImagePlanUpdate[]): Promise<void> {
  if (!layoutSelectedTask.value) {
    return;
  }
  imagePlanSaving.value = true;
  try {
    const task = await desktopApi.saveContentStudioImagePlan(layoutSelectedTask.value.taskId, updates);
    layoutSelectedTask.value = task;
    layoutArticleCandidates.value = layoutArticleCandidates.value.map((item) => item.taskId === task.taskId ? task : item);
    imagePlanModalOpen.value = false;
    pageNotice.value = "配图计划已保存。";
  } finally {
    imagePlanSaving.value = false;
  }
}

function openImageAssetModal(): void {
  if (!layoutSelectedTask.value) {
    pageNotice.value = "请先选择文章。";
    return;
  }
  void loadImagePreviews();
  imageAssetModalOpen.value = true;
}

function openPublishPreviewDrawer(): void {
  if (!layoutSelectedTask.value) {
    pageNotice.value = "请先选择文章。";
    return;
  }
  void loadImagePreviews();
  publishPreviewOpen.value = true;
}

async function withImageAssetSave(action: () => Promise<ContentStudioTask>): Promise<void> {
  imageAssetSaving.value = true;
  try {
    const task = await action();
    layoutSelectedTask.value = task;
    layoutArticleCandidates.value = layoutArticleCandidates.value.map((item) => item.taskId === task.taskId ? task : item);
    await loadImagePreviews();
  } finally {
    imageAssetSaving.value = false;
  }
}

async function addLocalImageToLayoutTask(): Promise<void> {
  if (!layoutSelectedTask.value) {
    return;
  }
  const imagePath = await desktopApi.selectImage();
  if (!imagePath) {
    return;
  }
  await withImageAssetSave(() => desktopApi.addContentStudioLocalImage(layoutSelectedTask.value!.taskId, imagePath));
  pageNotice.value = "图片已导入图片池。";
}

async function bindImageForLayoutTask(paragraphId: string, assetId: string): Promise<void> {
  if (!layoutSelectedTask.value) {
    return;
  }
  await withImageAssetSave(() =>
    desktopApi.bindContentStudioImage(layoutSelectedTask.value!.taskId, paragraphId, assetId)
  );
  pageNotice.value = `已绑定段落 ${paragraphId}。`;
}

async function unbindImageForLayoutTask(paragraphId: string): Promise<void> {
  if (!layoutSelectedTask.value) {
    return;
  }
  await withImageAssetSave(() =>
    desktopApi.unbindContentStudioImage(layoutSelectedTask.value!.taskId, paragraphId)
  );
  pageNotice.value = `已解绑段落 ${paragraphId}。`;
}

async function deleteImageFromLayoutTask(assetId: string): Promise<void> {
  if (!layoutSelectedTask.value) {
    return;
  }
  const confirmed = window.confirm("确认删除该图片吗？删除后会自动解除绑定。");
  if (!confirmed) {
    return;
  }
  await withImageAssetSave(() =>
    desktopApi.deleteContentStudioImage(layoutSelectedTask.value!.taskId, assetId)
  );
  pageNotice.value = "图片已删除并自动解绑。";
}

async function generateAiImageForLayoutTask(payload: { paragraphId: string; prompt: string; bindAfterGenerate: boolean }): Promise<void> {
  if (!layoutSelectedTask.value) {
    return;
  }
  pageNotice.value = "AI 生图进行中，请稍候...";
  try {
    await withImageAssetSave(() =>
      desktopApi.generateContentStudioAiImage(layoutSelectedTask.value!.taskId, {
        paragraphId: payload.paragraphId || undefined,
        prompt: payload.prompt,
        bindAfterGenerate: payload.bindAfterGenerate
      })
    );
    pageNotice.value = "AI 图片已生成并加入图片池。";
  } catch (error) {
    pageNotice.value = error instanceof Error ? `AI 生图失败：${error.message}` : "AI 生图失败";
  }
}

async function copyLayoutPublishDraft(): Promise<void> {
  if (!layoutSelectedTask.value) {
    pageNotice.value = "请先选择文章。";
    return;
  }
  copyingPublishDraft.value = true;
  try {
    const draft = await desktopApi.buildContentStudioPublishDraft(layoutSelectedTask.value.taskId);
    try {
      await navigator.clipboard.writeText(draft);
      pageNotice.value = "发布稿已复制。";
    } catch {
      publishDraftFallbackText.value = draft;
      publishDraftFallbackOpen.value = true;
      pageNotice.value = "系统剪贴板不可用，请在弹窗中手动复制。";
    }
  } catch (error) {
    pageNotice.value = error instanceof Error ? error.message : "复制发布稿失败";
  } finally {
    copyingPublishDraft.value = false;
  }
}

async function exportLayoutWord(): Promise<void> {
  if (!layoutSelectedTask.value) {
    pageNotice.value = "请先选择文章。";
    return;
  }
  exportingWord.value = true;
  try {
    const outputPath = await desktopApi.exportContentStudioWord(layoutSelectedTask.value.taskId);
    if (outputPath) {
      pageNotice.value = `Word 已导出：${outputPath}`;
    }
  } catch (error) {
    pageNotice.value = error instanceof Error ? error.message : "Word 导出失败";
  } finally {
    exportingWord.value = false;
  }
}

async function exportLayoutImages(): Promise<void> {
  if (!layoutSelectedTask.value) {
    pageNotice.value = "请先选择文章。";
    return;
  }
  exportingImages.value = true;
  try {
    const outputPath = await desktopApi.exportContentStudioImages(layoutSelectedTask.value.taskId);
    if (outputPath) {
      pageNotice.value = `图片压缩包已导出：${outputPath}`;
    }
  } catch (error) {
    pageNotice.value = error instanceof Error ? error.message : "图片压缩包导出失败";
  } finally {
    exportingImages.value = false;
  }
}

function openTopicAdvancedSettings(): void {
  topicAdvancedModalOpen.value = true;
}

function saveTopicAdvancedSettings(nextSettings: {
  reviewRounds: number;
  targetReader: string;
  writingStyle: string;
  wordRange: string;
  generateTitleCandidates: boolean;
  generateCoverText: boolean;
  generateImagePlan: boolean;
}): void {
  topicAdvancedSettings.value = {
    ...nextSettings
  };
  topicAdvancedModalOpen.value = false;
  pageNotice.value = "话题成文高级设置已更新。";
}

function openTopicRunLog(): void {
  if (latestTopicTask.value) {
    runLogTitle.value = "话题成文 - 运行记录";
    runLogDescription.value = formatRunLogDescription(latestTopicTask.value);
  }
  runLogOpen.value = true;
}

function openMaterialRunLog(): void {
  if (latestMaterialTask.value) {
    runLogTitle.value = "素材二创 - 运行记录";
    runLogDescription.value = formatRunLogDescription(latestMaterialTask.value);
  } else {
    runLogTitle.value = "素材二创 - 运行记录";
    runLogDescription.value = "暂无素材二创运行记录。";
  }
  runLogOpen.value = true;
}

function reopenLatestTopicResult(): void {
  const task = recentResultTask.value;
  if (!task) {
    pageNotice.value = "暂无最近结果，请先执行一次话题成文。";
    return;
  }
  latestTopicTask.value = task;
  resultDrawerOpen.value = true;
}

async function startTopicCreate(payload: {
  topic: string;
  platform: TopicCreateInput["platform"];
  articleType: TopicCreateInput["articleType"];
}): Promise<void> {
  const topicInput: TopicCreateInput = {
    topic: payload.topic,
    platform: payload.platform,
    articleType: payload.articleType,
    reviewRounds: topicAdvancedSettings.value.reviewRounds,
    targetReader: topicAdvancedSettings.value.targetReader || undefined,
    writingStyle: topicAdvancedSettings.value.writingStyle || undefined,
    wordRange: topicAdvancedSettings.value.wordRange || undefined,
    generateTitleCandidates: topicAdvancedSettings.value.generateTitleCandidates,
    generateCoverText: topicAdvancedSettings.value.generateCoverText,
    generateImagePlan: topicAdvancedSettings.value.generateImagePlan
  };
  await executeTopicCreate(topicInput);
}

async function executeTopicCreate(topicInput: TopicCreateInput): Promise<void> {
  topicRunning.value = true;
  pageNotice.value = "";
  topicProgress.value = null;

  try {
    const task = await desktopApi.runContentStudioTopic(topicInput);
    latestTopicTask.value = task;

    if (task.status === "completed" && task.result) {
      pageNotice.value = "话题成文已完成，结果已写入任务并展示在结果抽屉。";
    } else {
      pageNotice.value = "话题成文执行失败，可在运行记录查看详细步骤。";
    }

    runLogTitle.value = "话题成文 - 运行记录";
    runLogDescription.value = formatRunLogDescription(task);
    resultDrawerOpen.value = true;
  } catch (error) {
    pageNotice.value = error instanceof Error ? error.message : "话题成文执行失败";
  } finally {
    topicRunning.value = false;
  }
}

const topicProgressLabel = computed(() => {
  if (!topicProgress.value) {
    return "";
  }
  const statusMap: Record<ContentStudioTopicProgress["status"], string> = {
    queued: "排队中",
    running_step: "执行中",
    parsing_result: "结果解析中",
    completed: "已完成",
    failed: "失败"
  };
  return `${statusMap[topicProgress.value.status]} · ${topicProgress.value.progress}% · ${topicProgress.value.message}`;
});

const materialProgressLabel = computed(() => {
  if (!materialProgress.value) {
    return "";
  }
  const statusMap: Record<ContentStudioMaterialProgress["status"], string> = {
    queued: "排队中",
    collecting_sources: "采集中",
    running_step: "执行中",
    parsing_result: "结果解析中",
    completed: "已完成",
    failed: "失败"
  };
  return `${statusMap[materialProgress.value.status]} · ${materialProgress.value.progress}% · ${materialProgress.value.message}`;
});

async function addMaterialText(payload: { title?: string; body: string }): Promise<void> {
  materialSourceBusy.value = true;
  try {
    materialPack.value = await desktopApi.addContentStudioMaterialText({
      ...payload,
      current: materialPack.value,
      maxSourceCount: 5
    });
    pageNotice.value = "文本素材已添加。";
  } catch (error) {
    pageNotice.value = error instanceof Error ? error.message : "添加文本素材失败";
  } finally {
    materialSourceBusy.value = false;
  }
}

async function addMaterialUrl(payload: { url: string; title?: string }): Promise<void> {
  materialSourceBusy.value = true;
  try {
    materialPack.value = await desktopApi.addContentStudioMaterialUrl({
      ...payload,
      current: materialPack.value,
      collectImagesFromUrl: true,
      maxSourceCount: 5
    });
    pageNotice.value = "URL 素材已采集并添加。";
  } catch (error) {
    pageNotice.value = error instanceof Error ? error.message : "添加 URL 素材失败";
  } finally {
    materialSourceBusy.value = false;
  }
}

async function addMaterialWord(): Promise<void> {
  materialSourceBusy.value = true;
  const filePath = await desktopApi.selectWord();
  if (!filePath) {
    materialSourceBusy.value = false;
    return;
  }
  try {
    materialPack.value = await desktopApi.addContentStudioMaterialWord({
      filePath,
      current: materialPack.value,
      maxSourceCount: 5
    });
    pageNotice.value = "Word 素材已导入。";
  } catch (error) {
    pageNotice.value = error instanceof Error ? error.message : "导入 Word 素材失败";
  } finally {
    materialSourceBusy.value = false;
  }
}

function removeMaterialSource(sourceId: string): void {
  materialPack.value = {
    ...materialPack.value,
    sources: materialPack.value.sources.filter((item) => item.sourceId !== sourceId)
  };
}

function updateMaterialSourceBody(payload: { sourceId: string; body: string }): void {
  materialPack.value = {
    ...materialPack.value,
    sources: materialPack.value.sources.map((item) =>
      item.sourceId === payload.sourceId ? { ...item, body: payload.body } : item
    )
  };
}

async function startMaterialRewrite(payload: MaterialRewriteInput): Promise<void> {
  materialRunning.value = true;
  materialProgress.value = null;
  pageNotice.value = "";
  try {
    const task = await desktopApi.runContentStudioMaterial(payload);
    latestMaterialTask.value = task;
    if (task.status === "completed" && task.result) {
      pageNotice.value = "素材二创已完成，结果已写入任务。";
      runLogTitle.value = "素材二创 - 运行记录";
      runLogDescription.value = formatRunLogDescription(task);
      latestTopicTask.value = task;
      resultDrawerOpen.value = true;
      materialPack.value = { sources: [] };
    } else {
      pageNotice.value = task.error || "素材二创执行失败";
    }
  } catch (error) {
    pageNotice.value = error instanceof Error ? error.message : "素材二创执行失败";
  } finally {
    materialRunning.value = false;
  }
}

function formatRunLogDescription(task: ContentStudioTask): string {
  if (!task.debateSteps.length) {
    return `任务ID：${task.taskId}\n当前无讨论步骤记录。`;
  }

  const lines = task.debateSteps.map((step, index) => [
    `${index + 1}. ${step.displayName} (${step.name}) [${step.role}] ${step.status}`,
    `provider/profile: ${step.provider} / ${step.profile}`,
    `startedAt: ${step.startedAt}`,
    step.finishedAt ? `finishedAt: ${step.finishedAt}` : "",
    `prompt: ${step.prompt}`,
    `response: ${step.response}`,
    step.error ? `error: ${step.error}` : ""
  ].filter((item) => Boolean(item)).join("\n"));

  return `任务ID：${task.taskId}\n${lines.join("\n")}`;
}

function openRunLogFromDrawer(): void {
  if (latestTopicTask.value?.tab === "material") {
    openMaterialRunLog();
    return;
  }
  openTopicRunLog();
}

function rerunTopicFromDrawer(): void {
  if (!latestTopicTask.value) {
    pageNotice.value = "暂无可重新生成的任务。";
    return;
  }
  const input = latestTopicTask.value.input as TopicCreateInput;
  topicAdvancedSettings.value = {
    reviewRounds: input.reviewRounds ?? 2,
    targetReader: input.targetReader || "",
    writingStyle: input.writingStyle || "",
    wordRange: input.wordRange || "",
    generateTitleCandidates: input.generateTitleCandidates ?? true,
    generateCoverText: input.generateCoverText ?? true,
    generateImagePlan: input.generateImagePlan ?? true
  };
  void executeTopicCreate(input);
}
</script>

<template>
  <section class="studio-page">
    <header class="page-header">
      <div class="header-left">
        <button class="ghost-btn" @click="goHome">返回首页</button>
        <div>
          <h1>内容创作工作台</h1>
          <p>按选项卡独立管理双模型配置，支持模块化迭代。</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="ghost-btn" @click="openGlobalSettings">全局配置</button>
        <button class="ghost-btn" :disabled="!recentResultTask" @click="reopenLatestTopicResult">最近结果</button>
        <button class="ghost-btn" @click="openTaskHistory">历史任务</button>
      </div>
    </header>

    <p v-if="pageNotice" class="notice">{{ pageNotice }}</p>
    <p v-if="topicProgressLabel" class="progress-line">{{ topicProgressLabel }}</p>
    <p v-if="loading" class="hint">加载中...</p>
    <p v-else-if="configStatus && !configStatus.ready" class="warning">
      当前配置未完成：{{ configStatus.missingItems.join("、") || "请先配置" }}
    </p>

    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="setActiveTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <section class="tab-content">
      <TopicCreateTab
        v-if="activeTab === 'topic'"
        :tab-ready="currentTabStatus.ready"
        :missing-items="currentTabStatus.missingItems"
        :running="topicRunning"
        @open-model-settings="openModelSettings('topic')"
        @open-run-log="openTopicRunLog"
        @open-advanced-settings="openTopicAdvancedSettings"
        @start-topic-create="startTopicCreate"
      />
      <MaterialRewriteTab
        v-if="activeTab === 'material'"
        :tab-ready="currentTabStatus.ready"
        :missing-items="currentTabStatus.missingItems"
        :running="materialRunning"
        :material-pack="materialPack"
        :progress-label="materialProgressLabel"
        @open-model-settings="openModelSettings('material')"
        @open-run-log="openMaterialRunLog"
        @open-source-modal="materialSourceModalOpen = true"
        @start-material-rewrite="startMaterialRewrite"
      />
      <HotCreateTab
        v-if="activeTab === 'hot'"
        :tab-ready="currentTabStatus.ready"
        :missing-items="currentTabStatus.missingItems"
        @open-model-settings="openModelSettings('hot')"
        @open-run-log="runLogOpen = true"
      />
      <LayoutTab
        v-if="activeTab === 'layout'"
        :tab-ready="currentTabStatus.ready"
        :missing-items="currentTabStatus.missingItems"
        :selected-task="layoutSelectedTask"
        :copying-publish-draft="copyingPublishDraft"
        :exporting-word="exportingWord"
        :exporting-images="exportingImages"
        @open-model-settings="openModelSettings('layout')"
        @open-run-log="runLogOpen = true"
        @open-article-picker="openLayoutArticlePicker"
        @open-image-plan="openImagePlanModal"
        @open-image-assets="openImageAssetModal"
        @copy-publish-draft="copyLayoutPublishDraft"
        @open-publish-preview="openPublishPreviewDrawer"
        @export-word="exportLayoutWord"
        @export-images="exportLayoutImages"
      />
    </section>

    <ContentStudioSettingsModal
      :open="globalModalOpen"
      :settings="settings"
      :saving="savingGlobal"
      @close="globalModalOpen = false"
      @save="saveGlobalSettings"
    />

    <TabModelSettingsModal
      :open="tabModelModalOpen"
      :tab="modelSettingsTab"
      :settings="currentModelSettings"
      :saving="savingTab"
      :testing-role="testingRole"
      :test-message="testMessage"
      @close="tabModelModalOpen = false"
      @save="saveTabSettings"
      @test="testTabModel"
    />

    <TopicAdvancedSettingsModal
      :open="topicAdvancedModalOpen"
      :settings="topicAdvancedSettings"
      @close="topicAdvancedModalOpen = false"
      @save="saveTopicAdvancedSettings"
    />

    <MaterialSourceModal
      :open="materialSourceModalOpen"
      :material-pack="materialPack"
      :busy="materialSourceBusy"
      @close="materialSourceModalOpen = false"
      @add-text="addMaterialText"
      @add-url="addMaterialUrl"
      @add-word="addMaterialWord"
      @remove-source="removeMaterialSource"
      @update-source-body="updateMaterialSourceBody"
    />

    <RunLogModal
      :open="runLogOpen"
      :title="runLogTitle"
      :description="runLogDescription"
      @close="runLogOpen = false"
    />

    <StudioResultDrawer
      :open="resultDrawerOpen"
      :task="latestTopicTask"
      :running="topicRunning"
      :allow-rerun="latestTopicTask?.tab === 'topic'"
      @view-run-log="openRunLogFromDrawer"
      @rerun="rerunTopicFromDrawer"
      @close="resultDrawerOpen = false"
    />

    <ArticlePickerModal
      :open="layoutArticlePickerOpen"
      :tasks="layoutArticleCandidates"
      :loading="layoutArticleLoading"
      :selecting-task-id="layoutSelectingTaskId"
      @close="layoutArticlePickerOpen = false"
      @select="selectLayoutArticle"
    />

    <TaskHistoryModal
      :open="taskHistoryOpen"
      :loading="taskHistoryLoading"
      :deleting-task-id="taskHistoryDeletingTaskId"
      :tasks="topicTaskSummaries"
      :page="taskHistoryPage"
      :page-size="taskHistoryPageSize"
      :active-tab="taskHistoryActiveTab"
      @close="taskHistoryOpen = false"
      @change-tab="changeTaskHistoryTab"
      @change-page="changeTaskHistoryPage"
      @delete="deleteTaskFromHistory"
      @open="openTaskFromHistory"
    />

    <ImagePlanModal
      :open="imagePlanModalOpen"
      :task="layoutSelectedTask"
      :saving="imagePlanSaving"
      @close="imagePlanModalOpen = false"
      @save="saveImagePlan"
    />

    <ImageAssetModal
      :open="imageAssetModalOpen"
      :task="layoutSelectedTask"
      :saving="imageAssetSaving"
      :image-preview-map="imagePreviewMap"
      @close="imageAssetModalOpen = false"
      @add-local-image="addLocalImageToLayoutTask"
      @bind="bindImageForLayoutTask"
      @unbind="unbindImageForLayoutTask"
      @delete-image="deleteImageFromLayoutTask"
      @generate-ai-image="generateAiImageForLayoutTask"
    />

    <PublishPreviewDrawer
      :open="publishPreviewOpen"
      :task="layoutSelectedTask"
      :image-preview-map="imagePreviewMap"
      @close="publishPreviewOpen = false"
    />

    <PublishDraftFallbackModal
      :open="publishDraftFallbackOpen"
      :text="publishDraftFallbackText"
      @close="publishDraftFallbackOpen = false"
    />
  </section>
</template>

<style scoped>
.studio-page {
  height: 100%;
  padding: 24px 28px 30px;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}

.header-left {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.header-left h1 {
  margin: 0;
  font-size: 36px;
}

.header-left p {
  margin: 8px 0 0;
  color: #9cb3d7;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.tab-btn,
.ghost-btn {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(140, 173, 247, 0.18);
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
  cursor: pointer;
  font-weight: 600;
}

.tab-btn.active {
  border-color: rgba(108, 174, 255, 0.56);
  background: rgba(108, 174, 255, 0.12);
}

.notice,
.hint,
.warning {
  margin: 0;
}

.notice {
  color: #9de3c8;
}

.progress-line {
  margin: 0;
  color: #7bd0ff;
}

.hint {
  color: #9cb3d7;
}

.warning {
  color: #ffc1a8;
}

.tab-content {
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(149, 181, 255, 0.14);
  background: rgba(255, 255, 255, 0.03);
}

@media (max-width: 1100px) {
  .page-header,
  .header-left,
  .header-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
