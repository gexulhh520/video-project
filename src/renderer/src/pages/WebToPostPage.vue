<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type {
  AppSettings,
  WebCrawlRecord,
  WebCrawlTask,
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
const imagePoolOpen = ref(false);
const taskList = ref<WebTaskSummary[]>([]);
const activeTask = ref<WebCrawlTask | null>(null);
const taskLoading = ref(false);
const busy = ref(false);
const exportBusy = ref(false);
const errorMessage = ref("");
const urlInput = ref("");
const extractPromptInput = ref("");
const rewritePromptInput = ref("");
const editableBody = ref("");
const imageUrls = ref<Record<string, string>>({});
const progress = ref<WebTaskProgress>({
  taskId: "idle",
  status: "idle",
  progress: 0,
  message: "等待创建任务"
});

let unsubscribe: (() => void) | null = null;

const currentRecord = computed<WebCrawlRecord | null>(() => {
  if (!activeTask.value?.currentRecordId) {
    return activeTask.value?.records[0] ?? null;
  }

  return activeTask.value.records.find((item) => item.recordId === activeTask.value?.currentRecordId) ?? null;
});

const confirmedRecords = computed(() =>
  activeTask.value?.records.filter((record) => record.userEditedBody.trim()).length ?? 0
);

const selectedImageCount = computed(() => activeTask.value?.imageAssets.filter((item) => item.selected).length ?? 0);
const totalImageCount = computed(() => activeTask.value?.imageAssets.length ?? 0);

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
    if (record?.sourceUrl && (!urlInput.value || record.recordId === activeTask.value?.currentRecordId)) {
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
  () => activeTask.value?.imageAssets,
  async (assets) => {
    if (!assets?.length) {
      imageUrls.value = {};
      return;
    }

    const nextEntries = await Promise.all(
      assets
        .filter((asset) => asset.localPath)
        .map(async (asset) => [asset.assetId, await desktopApi.readImageAsDataUrl(asset.localPath!)] as const)
    );
    imageUrls.value = Object.fromEntries(nextEntries);
  },
  { immediate: true }
);

watch(
  totalImageCount,
  (count) => {
    if (!count) {
      imagePoolOpen.value = false;
    }
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
    activeTask.value = await desktopApi.startWebCrawl(activeTask.value.taskId, {
      url: urlInput.value.trim(),
      recordId
    });
    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "执行抓取失败";
  } finally {
    busy.value = false;
  }
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

async function rewriteTask(): Promise<void> {
  if (!activeTask.value) {
    return;
  }

  busy.value = true;
  errorMessage.value = "";

  try {
    activeTask.value = await desktopApi.rewriteWebTask(activeTask.value.taskId, {
      prompt: rewritePromptInput.value
    });
    await refreshTaskList();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "二次原创失败";
  } finally {
    busy.value = false;
  }
}

async function toggleImage(assetId: string, selected: boolean): Promise<void> {
  if (!activeTask.value) {
    return;
  }

  activeTask.value = await desktopApi.toggleWebImageSelection(activeTask.value.taskId, assetId, selected);
}

async function exportWord(): Promise<void> {
  if (!activeTask.value || exportBusy.value) {
    return;
  }

  exportBusy.value = true;
  errorMessage.value = "";

  try {
    const outputPath = await desktopApi.exportWebTaskToWord(activeTask.value.taskId);
    if (outputPath) {
      progress.value = {
        taskId: activeTask.value.taskId,
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

function openImagePool(): void {
  if (!totalImageCount.value) {
    return;
  }

  imagePoolOpen.value = true;
}

function closeImagePool(): void {
  imagePoolOpen.value = false;
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
            v-for="task in taskList"
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
        <div class="stack-actions">
          <button class="primary-btn" :disabled="busy || !activeTask" @click="runCrawl()">开始抓取</button>
          <button class="ghost-btn" :disabled="busy || !currentRecord" @click="runCrawl(currentRecord?.recordId)">
            重新执行抓取流程
          </button>
        </div>
        <small>每次执行前都会先做 bb-browser 健康检查，不健康时会自动 reset 后继续。</small>
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
        <div v-else-if="!currentRecord" class="empty-state">输入链接后开始抓取，这里会显示标题和提取正文。</div>
        <div v-else class="editor-shell">
          <label class="field">
            <span>网页标题</span>
            <input :value="currentRecord.title" type="text" disabled />
          </label>

          <label class="field">
            <span>补充提示词后重新提取</span>
            <textarea
              v-model="extractPromptInput"
              rows="3"
              placeholder="例如：只保留新闻正文，不要评论区和相关推荐。"
            />
          </label>

          <label class="field field-grow">
            <span>提取正文</span>
            <textarea
              v-model="editableBody"
              rows="16"
              placeholder="抓取后，这里会出现 LLM 提取的正文。"
            />
          </label>

          <div class="action-row">
            <button class="primary-btn" :disabled="busy" @click="saveConfirmedBody">保存正文修改</button>
            <button class="ghost-btn" :disabled="busy" @click="retryExtract">基于提示词重新提取</button>
            <button class="ghost-btn" :disabled="busy" @click="collectImages">确认正文并抓取图片</button>
          </div>

          <p class="hint">页面未登录、未加载完整或抓到空白内容时，请先手动处理页面，再点击“重新执行抓取流程”。</p>

          <div class="inline-media-entry">
            <div>
              <strong>这次正文的图片池</strong>
              <span>
                {{ totalImageCount ? `已抓取 ${totalImageCount} 张，可勾选 ${selectedImageCount} 张` : "确认正文并抓图后，可在这里统一查看" }}
              </span>
            </div>
            <button class="ghost-btn media-entry-btn" :disabled="!totalImageCount" @click="openImagePool">
              查看这次正文的图片池
            </button>
          </div>
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
            <span>已选 {{ selectedImageCount }} 张图片</span>
          </div>
        </div>

        <div class="rewrite-result">
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
            <button class="ghost-btn" :disabled="exportBusy || !activeTask?.rewriteResult" @click="exportWord">
              {{ exportBusy ? "导出中..." : "导出到 Word" }}
            </button>
          </div>

          <div v-if="activeTask?.rewriteResult" class="rewrite-preview">
            <h3>{{ activeTask.rewriteResult.title }}</h3>
            <p v-for="(paragraph, index) in activeTask.rewriteResult.paragraphs" :key="`${index}-${paragraph.slice(0, 12)}`">
              {{ paragraph }}
            </p>
          </div>
          <div v-else class="empty-note">当前任务还没有最终原创结果。</div>
        </div>
      </section>
    </main>

    <div v-if="errorMessage" class="error-toast">{{ errorMessage }}</div>

    <div v-if="imagePoolOpen" class="modal-backdrop" @click.self="closeImagePool">
      <section class="image-pool-modal">
        <div class="panel-header image-pool-header">
          <div>
            <span class="eyebrow">Assets</span>
            <h2>当前任务图片池</h2>
          </div>
          <div class="header-meta">
            <span>{{ totalImageCount }} 张素材</span>
            <span>已选 {{ selectedImageCount }} 张</span>
          </div>
        </div>

        <button class="ghost-btn modal-close-btn" @click="closeImagePool">关闭</button>

        <div v-if="!activeTask?.imageAssets.length" class="empty-note">
          确认正文并抓取图片后，这里会显示本任务下的全部素材。
        </div>
        <div v-else class="asset-grid image-pool-grid">
          <label v-for="asset in activeTask.imageAssets" :key="asset.assetId" class="asset-card">
            <div class="asset-check">
              <input :checked="asset.selected" type="checkbox" @change="toggleImage(asset.assetId, ($event.target as HTMLInputElement).checked)" />
            </div>
            <img v-if="imageUrls[asset.assetId]" :src="imageUrls[asset.assetId]" :alt="asset.sourceUrl" />
            <div v-else class="asset-placeholder">图片预览不可用</div>
            <div class="asset-meta">
              <strong>{{ asset.failedReason ? "下载失败" : summarizeUrl(asset.sourceUrl, 42) }}</strong>
              <span>{{ asset.failedReason ? asset.failedReason : summarizeUrl(asset.sourceUrl, 72) }}</span>
            </div>
          </label>
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

.task-item.active {
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

.field-grow {
  min-height: 0;
}

.field-grow textarea {
  min-height: 0;
  height: 100%;
}

.field span {
  color: #9db4d8;
  font-size: 12px;
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

.rewrite-preview {
  display: grid;
  gap: 12px;
}

.rewrite-preview h3 {
  margin: 2px 0 0;
}

.rewrite-preview p {
  margin: 0;
  color: #d6e4ff;
  line-height: 1.8;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
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

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 12px;
  align-content: start;
}

.asset-card {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.025);
}

.asset-check {
  display: flex;
  justify-content: center;
}

.asset-card img,
.asset-placeholder {
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: 156px;
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

.image-pool-modal {
  width: min(1240px, 100%);
  max-height: min(84vh, 920px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 16px;
  padding: 24px;
  border-radius: 24px;
  border: 1px solid rgba(140, 173, 247, 0.2);
  background: linear-gradient(180deg, rgba(11, 17, 32, 0.96), rgba(8, 14, 28, 0.98));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
}

.image-pool-header {
  margin-bottom: 0;
}

.modal-close-btn {
  width: auto;
  justify-self: end;
  padding-inline: 20px;
}

.image-pool-grid {
  padding-right: 8px;
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

  .inline-media-entry {
    align-items: stretch;
    flex-direction: column;
  }

  .media-entry-btn,
  .modal-close-btn {
    width: 100%;
  }

  .modal-backdrop {
    padding: 18px;
  }

  .image-pool-modal {
    max-height: 88vh;
    padding: 18px;
  }
}
</style>
