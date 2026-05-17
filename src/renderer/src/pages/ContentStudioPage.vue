<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type {
  ContentStudioConfigStatus,
  ContentStudioModelRole,
  ContentStudioSettings,
  ContentStudioTask,
  ContentStudioTabKey,
  ContentStudioTabModelSettings,
  OpenCliProvider,
  TopicCreateInput
} from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";
import ContentStudioSettingsModal from "../components/content-studio/ContentStudioSettingsModal.vue";
import TopicCreateTab from "../components/content-studio/TopicCreateTab.vue";
import TopicAdvancedSettingsModal from "../components/content-studio/TopicAdvancedSettingsModal.vue";
import MaterialRewriteTab from "../components/content-studio/MaterialRewriteTab.vue";
import HotCreateTab from "../components/content-studio/HotCreateTab.vue";
import LayoutTab from "../components/content-studio/LayoutTab.vue";
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
const resultDrawerOpen = ref(false);
const topicAdvancedModalOpen = ref(false);
const runLogTitle = ref("运行记录");
const runLogDescription = ref("阶段 1 已预留运行记录弹窗入口，后续阶段会接入任务历史与详细日志。");
const resultDrawerTitle = ref("结果抽屉");
const resultDrawerSummary = ref("阶段 1 已预留结果抽屉，后续阶段会展示任务结果详情与导出入口。");
const testingRole = ref<ContentStudioModelRole | null>(null);
const testMessage = ref("");
const pageNotice = ref("");
const topicRunning = ref(false);
const latestTopicTask = ref<ContentStudioTask | null>(null);
const topicAdvancedSettings = ref({
  targetReader: "",
  writingStyle: "",
  wordRange: "1200-1800字",
  generateTitleCandidates: true,
  generateCoverText: true,
  generateImagePlan: true
});

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

onMounted(() => {
  void bootstrap();
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

function openTopicAdvancedSettings(): void {
  topicAdvancedModalOpen.value = true;
}

function saveTopicAdvancedSettings(nextSettings: {
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

function reopenLatestTopicResult(): void {
  if (!latestTopicTask.value) {
    pageNotice.value = "暂无最近结果，请先执行一次话题成文。";
    return;
  }

  if (latestTopicTask.value.status === "completed" && latestTopicTask.value.result) {
    const previewParagraphs = latestTopicTask.value.result.paragraphs
      .slice(0, 3)
      .map((paragraph) => `- ${paragraph.text}`)
      .join("\n");
    resultDrawerTitle.value = `话题成文 - ${latestTopicTask.value.result.title}`;
    resultDrawerSummary.value = [
      `任务ID：${latestTopicTask.value.taskId}`,
      latestTopicTask.value.result.coverText ? `封面文案：${latestTopicTask.value.result.coverText}` : "",
      "正文预览：",
      previewParagraphs || "- （暂无段落）",
      latestTopicTask.value.result.riskNotes?.length
        ? `风险提示：${latestTopicTask.value.result.riskNotes.join("；")}`
        : ""
    ]
      .filter((item) => Boolean(item))
      .join("\n");
  } else {
    resultDrawerTitle.value = "话题成文 - 最近任务";
    resultDrawerSummary.value = `任务ID：${latestTopicTask.value.taskId}\n状态：${latestTopicTask.value.status}\n${
      latestTopicTask.value.error ? `说明：${latestTopicTask.value.error}` : ""
    }`;
  }

  resultDrawerOpen.value = true;
}

async function startTopicCreate(payload: {
  topic: string;
  platform: TopicCreateInput["platform"];
  articleType: TopicCreateInput["articleType"];
}): Promise<void> {
  topicRunning.value = true;
  pageNotice.value = "";

  try {
    const topicInput: TopicCreateInput = {
      topic: payload.topic,
      platform: payload.platform,
      articleType: payload.articleType,
      targetReader: topicAdvancedSettings.value.targetReader || undefined,
      writingStyle: topicAdvancedSettings.value.writingStyle || undefined,
      wordRange: topicAdvancedSettings.value.wordRange || undefined,
      generateTitleCandidates: topicAdvancedSettings.value.generateTitleCandidates,
      generateCoverText: topicAdvancedSettings.value.generateCoverText,
      generateImagePlan: topicAdvancedSettings.value.generateImagePlan
    };
    const task = await desktopApi.runContentStudioTopic(topicInput);
    latestTopicTask.value = task;

    if (task.status === "completed" && task.result) {
      const previewParagraphs = task.result.paragraphs
        .slice(0, 3)
        .map((paragraph) => `- ${paragraph.text}`)
        .join("\n");
      resultDrawerTitle.value = `话题成文 - ${task.result.title}`;
      resultDrawerSummary.value = [
        `任务ID：${task.taskId}`,
        task.result.coverText ? `封面文案：${task.result.coverText}` : "",
        "正文预览：",
        previewParagraphs || "- （暂无段落）",
        task.result.riskNotes?.length ? `风险提示：${task.result.riskNotes.join("；")}` : ""
      ]
        .filter((item) => Boolean(item))
        .join("\n");
      pageNotice.value = "话题成文已完成，结果已写入任务并展示在结果抽屉。";
    } else {
      resultDrawerTitle.value = "话题成文 - 执行失败";
      resultDrawerSummary.value = `任务ID：${task.taskId}\n失败原因：${task.error || "未知错误"}`;
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

function formatRunLogDescription(task: ContentStudioTask): string {
  if (!task.debateSteps.length) {
    return `任务ID：${task.taskId}\n当前无讨论步骤记录。`;
  }

  const lines = task.debateSteps.map((step, index) => {
    const preview = step.response.replace(/\s+/g, " ").slice(0, 80);
    return `${index + 1}. ${step.name} [${step.role}] ${step.status}${preview ? `：${preview}` : ""}`;
  });

  return `任务ID：${task.taskId}\n${lines.join("\n")}`;
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
        <button class="ghost-btn" :disabled="!latestTopicTask" @click="reopenLatestTopicResult">最近结果</button>
        <button class="ghost-btn" @click="runLogOpen = true">历史任务</button>
      </div>
    </header>

    <p v-if="pageNotice" class="notice">{{ pageNotice }}</p>
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
        @click="activeTab = tab.key"
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
        @open-model-settings="openModelSettings('material')"
        @open-run-log="runLogOpen = true"
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
        @open-model-settings="openModelSettings('layout')"
        @open-run-log="runLogOpen = true"
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

    <RunLogModal
      :open="runLogOpen"
      :title="runLogTitle"
      :description="runLogDescription"
      @close="runLogOpen = false"
    />

    <StudioResultDrawer
      :open="resultDrawerOpen"
      :title="resultDrawerTitle"
      :summary="resultDrawerSummary"
      @close="resultDrawerOpen = false"
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
