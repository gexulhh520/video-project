﻿﻿﻿<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type {
  ArticleRewriteConfigStatus,
  ArticleRewriteSettings,
  AppSettings,
  ContentStudioConfigStatus,
  ContentStudioSettings,
  VideoToPostConfigStatus,
  VideoToPostSettings,
  WebToPostConfigStatus,
  WebToPostSettings
} from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";
import AppSettingsModal from "../components/AppSettingsModal.vue";
import ArticleRewriteSettingsModal from "../components/ArticleRewriteSettingsModal.vue";
import ContentStudioSettingsModal from "../components/content-studio/ContentStudioSettingsModal.vue";
import ToolCard from "../components/ToolCard.vue";
import VideoToPostSettingsModal from "../components/VideoToPostSettingsModal.vue";
import WebToPostSettingsModal from "../components/WebToPostSettingsModal.vue";

const router = useRouter();

const taobaoImg = new URL("../../../../public/taobao.jpg", import.meta.url).href;

const settingsOpen = ref(false);
const settingsSaving = ref(false);
const appSettings = ref<AppSettings | null>(null);

const webToolSettingsOpen = ref(false);
const webToolSettingsSaving = ref(false);
const webToolSettings = ref<WebToPostSettings | null>(null);
const webToolConfigStatus = ref<WebToPostConfigStatus | null>(null);
const videoToolSettingsOpen = ref(false);
const videoToolSettingsSaving = ref(false);
const videoToolSettings = ref<VideoToPostSettings | null>(null);
const videoToolConfigStatus = ref<VideoToPostConfigStatus | null>(null);
const articleToolSettingsOpen = ref(false);
const articleToolSettingsSaving = ref(false);
const articleToolSettings = ref<ArticleRewriteSettings | null>(null);
const articleToolConfigStatus = ref<ArticleRewriteConfigStatus | null>(null);
const contentStudioSettingsOpen = ref(false);
const contentStudioSettingsSaving = ref(false);
const contentStudioSettings = ref<ContentStudioSettings | null>(null);
const contentStudioConfigStatus = ref<ContentStudioConfigStatus | null>(null);
const homeNotice = ref("");

const tools = computed(() => [
  {
    title: "网页转文章原创",
    description: "输入网页链接，借助 bb-browser 抓取标题、正文和图片，再统一交给 LLM 做二次原创。",
    status: "available" as const,
    route: "/tools/web-to-post",
    blocked: !(webToolConfigStatus.value?.ready ?? false),
    blockedReason: (webToolConfigStatus.value?.ready ?? false)
      ? ""
      : `未完成工具配置，缺失：${webToolConfigStatus.value?.missingItems.join("、") || "请先配置"}`,
    actionLabel: "工具配置"
  },
  {
    title: "视频转图文",
    description: "导入本地视频，自动识别字幕、生成图文段落，并从关键时间点抽取配图。",
    status: "available" as const,
    route: "/tools/video-to-post",
    blocked: !(videoToolConfigStatus.value?.ready ?? false),
    blockedReason: (videoToolConfigStatus.value?.ready ?? false)
      ? ""
      : `未完成工具配置，缺失：${videoToolConfigStatus.value?.missingItems.join("、") || "请先配置"}`,
    actionLabel: "工具配置"
  },
  {
    title: "内容创作工作台",
    description: "聚合话题成文、素材二创、热点成文、图文排版，支持每个选项卡独立配置双模型。",
    status: "available" as const,
    route: "/tools/content-studio",
    blocked: !(contentStudioConfigStatus.value?.ready ?? false),
    clickableWhenBlocked: true,
    blockedReason: (contentStudioConfigStatus.value?.ready ?? false)
      ? ""
      : `未完成配置：${contentStudioConfigStatus.value?.missingItems.join("、") || "请先配置 OpenCLI 和双模型"}（可直接进入工作台完成模型配置）`,
    actionLabel: "工具配置"
  },
  {
    title: "图文改写",
    description: "上传 Word，解析段落和图片后按提示词整体或逐段洗稿并导出。",
    status: "available" as const,
    route: "/tools/article-rewrite",
    blocked: !(articleToolConfigStatus.value?.ready ?? false),
    blockedReason: (articleToolConfigStatus.value?.ready ?? false)
      ? ""
      : `未完成工具配置，缺失：${articleToolConfigStatus.value?.missingItems.join("、") || "请先配置"}`,
    actionLabel: "工具配置"
  },
  {
    title: "热点雷达",
    description: "按账号画像+平台命令采集热点，标准化、去重、筛选并产出推荐热点。",
    status: "available" as const,
    route: "/tools/hotspot-radar",
    blocked: false,
    blockedReason: "",
    actionLabel: "开发版"
  },
  // {
  //   title: "爆款标题生成",
  //   description: "基于内容主题自动生成更适合分发场景的标题方案。",
  //   status: "coming-soon" as const
  // },
  {
    title: "期待...",
    description: "输出封面主文案与副标题候选，方便直接用于封面图。",
    status: "coming-soon" as const
  }
  // {
  //   title: "封面文案生成",
  //   description: "输出封面主文案与副标题候选，方便直接用于封面图。",
  //   status: "coming-soon" as const
  // }
]);

onMounted(() => {
  void loadSettings();
  void loadWebToolConfig();
  void loadVideoToolConfig();
  void loadContentStudioConfig();
  void loadArticleToolConfig();
});

async function loadSettings(): Promise<void> {
  appSettings.value = await desktopApi.getAppSettings();
}

async function loadWebToolConfig(): Promise<void> {
  webToolConfigStatus.value = await desktopApi.getWebToPostConfigStatus();
}

async function loadVideoToolConfig(): Promise<void> {
  videoToolConfigStatus.value = await desktopApi.getVideoToPostConfigStatus();
}

async function loadArticleToolConfig(): Promise<void> {
  articleToolConfigStatus.value = await desktopApi.getArticleRewriteConfigStatus();
}

async function loadContentStudioConfig(): Promise<void> {
  contentStudioConfigStatus.value = await desktopApi.getContentStudioConfigStatus();
}

async function openSettings(): Promise<void> {
  await loadSettings();
  settingsOpen.value = true;
}

async function openWebToolSettings(): Promise<void> {
  webToolSettings.value = await desktopApi.getWebToPostSettings();
  webToolConfigStatus.value = await desktopApi.getWebToPostConfigStatus();
  webToolSettingsOpen.value = true;
}

async function openVideoToolSettings(): Promise<void> {
  videoToolSettings.value = await desktopApi.getVideoToPostSettings();
  videoToolConfigStatus.value = await desktopApi.getVideoToPostConfigStatus();
  videoToolSettingsOpen.value = true;
}

async function openArticleToolSettings(): Promise<void> {
  articleToolSettings.value = await desktopApi.getArticleRewriteSettings();
  articleToolConfigStatus.value = await desktopApi.getArticleRewriteConfigStatus();
  articleToolSettingsOpen.value = true;
}

async function openContentStudioSettings(): Promise<void> {
  contentStudioSettings.value = await desktopApi.getContentStudioSettings();
  contentStudioConfigStatus.value = await desktopApi.getContentStudioConfigStatus();
  contentStudioSettingsOpen.value = true;
}

async function browseWorkspaceDir(): Promise<void> {
  const nextDirectory = await desktopApi.selectDirectory();
  if (!nextDirectory) return;

  appSettings.value = {
    ...(appSettings.value ?? {}),
    workspaceDir: nextDirectory
  };
}

async function saveSettings(nextSettings: AppSettings): Promise<void> {
  settingsSaving.value = true;
  try {
    appSettings.value = await desktopApi.saveAppSettings(nextSettings);
    settingsOpen.value = false;
  } finally {
    settingsSaving.value = false;
  }
}

async function saveWebToolSettings(nextSettings: WebToPostSettings): Promise<void> {
  webToolSettingsSaving.value = true;
  try {
    webToolSettings.value = await desktopApi.saveWebToPostSettings(nextSettings);
    webToolConfigStatus.value = await desktopApi.getWebToPostConfigStatus();
    webToolSettingsOpen.value = false;
    homeNotice.value = "网页工具配置已保存。";
  } finally {
    webToolSettingsSaving.value = false;
  }
}

async function saveVideoToolSettings(nextSettings: VideoToPostSettings): Promise<void> {
  videoToolSettingsSaving.value = true;
  try {
    videoToolSettings.value = await desktopApi.saveVideoToPostSettings(nextSettings);
    videoToolConfigStatus.value = await desktopApi.getVideoToPostConfigStatus();
    videoToolSettingsOpen.value = false;
    homeNotice.value = "视频工具配置已保存。";
  } finally {
    videoToolSettingsSaving.value = false;
  }
}

async function saveArticleToolSettings(nextSettings: ArticleRewriteSettings): Promise<void> {
  articleToolSettingsSaving.value = true;
  try {
    articleToolSettings.value = await desktopApi.saveArticleRewriteSettings(nextSettings);
    articleToolConfigStatus.value = await desktopApi.getArticleRewriteConfigStatus();
    articleToolSettingsOpen.value = false;
    homeNotice.value = "图文改写配置已保存。";
  } finally {
    articleToolSettingsSaving.value = false;
  }
}

async function saveContentStudioSettings(nextSettings: ContentStudioSettings): Promise<void> {
  contentStudioSettingsSaving.value = true;
  try {
    contentStudioSettings.value = await desktopApi.saveContentStudioSettings(nextSettings);
    contentStudioConfigStatus.value = await desktopApi.getContentStudioConfigStatus();
    contentStudioSettingsOpen.value = false;
    homeNotice.value = "内容创作工作台配置已保存。";
  } finally {
    contentStudioSettingsSaving.value = false;
  }
}

function handleToolClick(tool: (typeof tools.value)[number]): void {
  homeNotice.value = "";

  if (!tool.route) {
    return;
  }

  if (tool.route === "/tools/web-to-post" && tool.blocked) {
    homeNotice.value = tool.blockedReason || "请先完成网页工具配置后再进入。";
    return;
  }
  if (tool.route === "/tools/video-to-post" && tool.blocked) {
    homeNotice.value = tool.blockedReason || "请先完成视频工具配置后再进入。";
    return;
  }
  if (tool.route === "/tools/article-rewrite" && tool.blocked) {
    homeNotice.value = tool.blockedReason || "请先完成图文改写工具配置后再进入。";
    return;
  }
  void router.push(tool.route);
}
</script>

<template>
  <section class="home-page">
    <div class="hero">
      <div class="hero-top">
        <span class="eyebrow">Toolbox</span>
        <button class="settings-btn" @click="openSettings">全局设置</button>
      </div>
      <p>工具使用等问题可联系 微信：gexuxu520  备用qq:283282753</p>
      <!-- <p>淘宝店铺：</p>
      <img :src="taobaoImg" alt="淘宝店铺" class="taobao-image" /> -->
      <div v-if="appSettings" class="workspace-card">
        <span>当前工作空间目录</span>
        <strong>{{ appSettings.workspaceDir }}</strong>
      </div>
      <p v-if="homeNotice" class="home-notice">{{ homeNotice }}</p>
    </div>

    <div class="tool-grid">
      <ToolCard
        v-for="tool in tools"
        :key="tool.title"
        :title="tool.title"
        :description="tool.description"
        :status="tool.status"
        :blocked="tool.blocked"
        :blocked-reason="tool.blockedReason"
        :clickable-when-blocked="tool.clickableWhenBlocked"
        :action-label="tool.route === '/tools/web-to-post' || tool.route === '/tools/video-to-post' || tool.route === '/tools/article-rewrite' || tool.route === '/tools/content-studio' ? tool.actionLabel : undefined"
        @action="tool.route === '/tools/web-to-post' ? openWebToolSettings() : tool.route === '/tools/video-to-post' ? openVideoToolSettings() : tool.route === '/tools/article-rewrite' ? openArticleToolSettings() : tool.route === '/tools/content-studio' ? openContentStudioSettings() : undefined"
        @click="handleToolClick(tool)"
      />
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
      :open="webToolSettingsOpen"
      :settings="webToolSettings"
      :saving="webToolSettingsSaving"
      @close="webToolSettingsOpen = false"
      @save="saveWebToolSettings"
    />

    <VideoToPostSettingsModal
      :open="videoToolSettingsOpen"
      :settings="videoToolSettings"
      :saving="videoToolSettingsSaving"
      @close="videoToolSettingsOpen = false"
      @save="saveVideoToolSettings"
    />

    <ArticleRewriteSettingsModal
      :open="articleToolSettingsOpen"
      :settings="articleToolSettings"
      :saving="articleToolSettingsSaving"
      @close="articleToolSettingsOpen = false"
      @save="saveArticleToolSettings"
    />

    <ContentStudioSettingsModal
      :open="contentStudioSettingsOpen"
      :settings="contentStudioSettings"
      :saving="contentStudioSettingsSaving"
      @close="contentStudioSettingsOpen = false"
      @save="saveContentStudioSettings"
    />
  </section>
</template>

<style scoped>
.home-page {
  height: 100%;
  padding: 36px 40px 42px;
  overflow: auto;
}

.hero {
  max-width: 900px;
  margin-bottom: 30px;
}

.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #79c8ff;
}

.settings-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid rgba(143, 176, 255, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: #eef5ff;
  font-weight: 600;
  cursor: pointer;
}

h1 {
  margin: 12px 0 16px;
  font-size: 52px;
  line-height: 1.05;
}

p {
  margin: 0;
  color: #9cb3d7;
  font-size: 17px;
  line-height: 1.8;
}

.workspace-card {
  margin-top: 18px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(143, 176, 255, 0.14);
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

.home-notice {
  margin-top: 14px;
  color: #ffc1a8;
  font-size: 14px;
}

.taobao-image {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  margin-top: 8px;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

@media (max-width: 980px) {
  .tool-grid {
    grid-template-columns: 1fr;
  }

  h1 {
    font-size: 38px;
  }

  .hero-top {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
