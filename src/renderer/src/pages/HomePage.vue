<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { AppSettings } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";
import AppSettingsModal from "../components/AppSettingsModal.vue";
import ToolCard from "../components/ToolCard.vue";

const router = useRouter();

const tools = [
  {
    title: "视频转图文",
    description: "导入本地视频，自动识别字幕、生成图文段落，并从关键时间点抽取配图。",
    status: "available" as const,
    route: "/tools/video-to-post"
  },
  {
    title: "图文改写",
    description: "对现有图文内容做风格迁移、结构优化和平台适配。",
    status: "coming-soon" as const
  },
  {
    title: "爆款标题生成",
    description: "基于内容主题自动生成更适合分发场景的标题方案。",
    status: "coming-soon" as const
  },
  {
    title: "封面文案生成",
    description: "输出封面主文案与副标题候选，方便直接用于封面图。",
    status: "coming-soon" as const
  }
];

const settingsOpen = ref(false);
const settingsSaving = ref(false);
const appSettings = ref<AppSettings | null>(null);

onMounted(() => {
  void loadSettings();
});

async function loadSettings(): Promise<void> {
  appSettings.value = await desktopApi.getAppSettings();
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
  } finally {
    settingsSaving.value = false;
  }
}
</script>

<template>
  <section class="home-page">
    <div class="hero">
      <div class="hero-top">
        <span class="eyebrow">Toolbox</span>
        <button class="settings-btn" @click="openSettings">全局设置</button>
      </div>
      <h1>从一段视频，跑通一份可预览、可编辑、可导出的图文草稿。</h1>
      <p>第一阶段先把“视频 -> 音频 -> ASR -> LLM -> 抽图 -> 图文混排”完整打通。</p>
      <div v-if="appSettings" class="workspace-card">
        <span>当前空间目录</span>
        <strong>{{ appSettings.workspaceDir }}</strong>
      </div>
    </div>

    <div class="tool-grid">
      <ToolCard
        v-for="tool in tools"
        :key="tool.title"
        :title="tool.title"
        :description="tool.description"
        :status="tool.status"
        @click="tool.route ? router.push(tool.route) : undefined"
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
