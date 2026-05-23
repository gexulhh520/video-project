<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { HotspotRadarAccount, HotspotRadarCandidateSummary, HotspotRadarSavedSummary, HotspotRadarTaskSummary, HotspotRadarWatcher } from "../../../../main/types/app.types";
import { desktopApi } from "../../api/desktop-api";

const props = defineProps<{
  tabReady: boolean;
  missingItems: string[];
}>();

const emit = defineEmits<{
  openModelSettings: [];
  openRunLog: [];
}>();

const accounts = ref<HotspotRadarAccount[]>([]);
const selectedAccountId = ref("");
const accountName = ref("");
const accountPlatform = ref("公众号");
const contentStyle = ref("");
const mainTopicsText = ref("");
const targetAudienceText = ref("");
const tone = ref("");
const avoidTopicsText = ref("");
const preferredContentTypesText = ref("");
const accountEnabled = ref(true);

const watcherId = ref("watcher_hot_content");
const watcherName = ref("热点成文监听器");
const keywordsText = ref("OpenAI,AI Agent,自媒体");
const sourcesJson = ref(`[
  {"source":"weibo","enabled":true,"enabledCommands":["hot","search"],"topLimit":20,"searchLimit":5},
  {"source":"zhihu","enabled":true,"enabledCommands":["hot","search"],"topLimit":20,"searchLimit":5},
  {"source":"36kr","enabled":true,"enabledCommands":["hot","news","search"],"topLimit":20,"searchLimit":5}
]`);
const tasks = ref<HotspotRadarTaskSummary[]>([]);
const candidates = ref<HotspotRadarCandidateSummary[]>([]);
const saved = ref<HotspotRadarSavedSummary[]>([]);
const notice = ref("");

onMounted(async () => {
  await refreshAccounts();
});

watch(selectedAccountId, async (id) => {
  if (!id) {
    clearAccountForm();
    return;
  }
  await loadSelectedAccount(id);
  await refreshIndexes();
});

function parseCommaText(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function clearAccountForm(): void {
  accountName.value = "";
  accountPlatform.value = "公众号";
  contentStyle.value = "";
  mainTopicsText.value = "";
  targetAudienceText.value = "";
  tone.value = "";
  avoidTopicsText.value = "";
  preferredContentTypesText.value = "";
  accountEnabled.value = true;
}

function fillAccountForm(account: HotspotRadarAccount): void {
  accountName.value = account.accountName || "";
  accountPlatform.value = account.platform || "公众号";
  contentStyle.value = account.contentStyle || "";
  mainTopicsText.value = account.mainTopics.join(",");
  targetAudienceText.value = account.targetAudience.join(",");
  tone.value = account.tone || "";
  avoidTopicsText.value = account.avoidTopics.join(",");
  preferredContentTypesText.value = account.preferredContentTypes.join(",");
  accountEnabled.value = account.enabled;
}

async function loadSelectedAccount(accountId: string): Promise<void> {
  const account = await desktopApi.hotspotRadarGetAccountById(accountId);
  if (!account) {
    clearAccountForm();
    return;
  }
  fillAccountForm(account);
}

async function refreshAccounts(): Promise<void> {
  accounts.value = await desktopApi.hotspotRadarListAccounts();
  if (!selectedAccountId.value && accounts.value.length) {
    selectedAccountId.value = accounts.value[0].id;
  } else if (selectedAccountId.value) {
    await loadSelectedAccount(selectedAccountId.value);
  }
  await refreshIndexes();
}

async function refreshIndexes(): Promise<void> {
  if (!selectedAccountId.value) {
    tasks.value = [];
    candidates.value = [];
    saved.value = [];
    return;
  }
  tasks.value = await desktopApi.hotspotRadarListTasks(selectedAccountId.value);
  candidates.value = await desktopApi.hotspotRadarListCandidates(selectedAccountId.value);
  saved.value = await desktopApi.hotspotRadarListSaved(selectedAccountId.value);
}

async function createDemoAccount(): Promise<void> {
  const id = `account_${Date.now().toString().slice(-6)}`;
  await desktopApi.hotspotRadarCreateAccount({
    id,
    accountName: `热点成文账号-${id.slice(-4)}`,
    platform: "公众号",
    contentStyle: "观点分析 + 实操拆解",
    mainTopics: ["AI", "互联网", "内容创作"],
    targetAudience: ["创作者", "运营"],
    tone: "理性、犀利、实用",
    avoidTopics: ["娱乐八卦", "低俗猎奇"],
    preferredContentTypes: ["热点解读", "趋势判断"],
    enabled: true
  });
  selectedAccountId.value = id;
  notice.value = "已创建示例账号画像";
  await refreshAccounts();
}

async function saveAccountProfile(): Promise<void> {
  if (!accountName.value.trim()) {
    notice.value = "请先填写账号名称";
    return;
  }
  const id = selectedAccountId.value || `account_${Date.now().toString().slice(-6)}`;
  await desktopApi.hotspotRadarCreateAccount({
    id,
    accountName: accountName.value.trim(),
    platform: accountPlatform.value.trim() || "公众号",
    contentStyle: contentStyle.value.trim(),
    mainTopics: parseCommaText(mainTopicsText.value),
    targetAudience: parseCommaText(targetAudienceText.value),
    tone: tone.value.trim(),
    avoidTopics: parseCommaText(avoidTopicsText.value),
    preferredContentTypes: parseCommaText(preferredContentTypesText.value),
    enabled: accountEnabled.value
  });
  selectedAccountId.value = id;
  notice.value = "账号画像已保存";
  await refreshAccounts();
}

async function saveWatcher(): Promise<void> {
  if (!selectedAccountId.value) return;
  const watcher: Omit<HotspotRadarWatcher, "createdAt" | "updatedAt"> = {
    id: watcherId.value,
    accountId: selectedAccountId.value,
    name: watcherName.value,
    description: "热点成文内置监听器",
    enabled: true,
    sources: (() => {
      try {
        const value = JSON.parse(sourcesJson.value);
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    })(),
    keywords: parseCommaText(keywordsText.value),
    runIntervalMinutes: 60,
    dedupeLookbackDays: 15,
    maxCandidatesPerRun: 200,
    lastRunAt: ""
  };
  await desktopApi.hotspotRadarUpsertWatcher(watcher);
  notice.value = "热点成文监听器已保存";
}

async function collectAndScreen(): Promise<void> {
  if (!selectedAccountId.value) return;
  const result = await desktopApi.hotspotRadarRunManualTask(selectedAccountId.value, watcherId.value);
  notice.value = `本次完成：raw=${result.rawFileCount} / candidate=${result.candidateCount}`;
  await refreshIndexes();
}
</script>

<template>
  <section class="tab-panel">
    <header class="panel-header">
      <div>
        <h3>热点成文</h3>
        <p>热点雷达已内置到此页面，先采集筛选，再进入热点成文生产。</p>
      </div>
      <div class="header-actions">
        <button class="ghost-btn" @click="emit('openRunLog')">运行记录</button>
        <button class="ghost-btn" @click="emit('openModelSettings')">模型配置</button>
      </div>
    </header>

    <p v-if="!props.tabReady" class="warning">当前配置未完成：{{ props.missingItems.join("、") || "请先配置模型" }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>

    <div class="form-grid">
      <label class="field">
        <span>账号画像</span>
        <div class="row">
          <select v-model="selectedAccountId">
            <option value="" disabled>请选择账号</option>
            <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.accountName }}</option>
          </select>
          <button class="ghost-btn" @click="createDemoAccount">创建示例账号</button>
        </div>
      </label>
      <label class="field">
        <span>账号名称 / 平台</span>
        <div class="row">
          <input v-model="accountName" type="text" placeholder="账号名称" />
          <input v-model="accountPlatform" type="text" placeholder="平台" />
        </div>
      </label>
      <label class="field">
        <span>风格 / 语气</span>
        <div class="row">
          <input v-model="contentStyle" type="text" placeholder="内容风格" />
          <input v-model="tone" type="text" placeholder="语气" />
        </div>
      </label>
      <label class="field">
        <span>主话题（逗号）</span>
        <input v-model="mainTopicsText" type="text" />
      </label>
      <label class="field">
        <span>受众（逗号）</span>
        <input v-model="targetAudienceText" type="text" />
      </label>
      <label class="field">
        <span>避开话题（逗号）</span>
        <input v-model="avoidTopicsText" type="text" />
      </label>
      <label class="field field-full">
        <span>偏好内容类型（逗号）</span>
        <input v-model="preferredContentTypesText" type="text" />
      </label>
      <label class="field">
        <span>账号启用</span>
        <select v-model="accountEnabled">
          <option :value="true">启用</option>
          <option :value="false">禁用</option>
        </select>
      </label>
      <label class="field">
        <span>监听器ID/名称</span>
        <div class="row">
          <input v-model="watcherId" type="text" />
          <input v-model="watcherName" type="text" />
        </div>
      </label>
      <label class="field">
        <span>关键词（逗号）</span>
        <input v-model="keywordsText" type="text" />
      </label>
      <label class="field field-full">
        <span>采集平台配置（JSON）</span>
        <textarea v-model="sourcesJson" rows="6"></textarea>
      </label>
    </div>

    <div class="actions">
      <button class="ghost-btn" @click="saveAccountProfile">保存账号画像</button>
      <button class="ghost-btn" @click="saveWatcher" :disabled="!selectedAccountId">保存监听器</button>
      <button class="primary-btn" :disabled="!selectedAccountId" @click="collectAndScreen">采集+筛选</button>
    </div>

    <div class="grid-3" v-if="selectedAccountId">
      <section class="mini-card">
        <h4>任务记录（{{ tasks.length }}）</h4>
        <ul><li v-for="t in tasks.slice(0,5)" :key="t.id">{{ t.id }} / saved {{ t.savedCount }}</li></ul>
      </section>
      <section class="mini-card">
        <h4>候选热点（{{ candidates.length }}）</h4>
        <ul><li v-for="c in candidates.slice(0,5)" :key="c.id">{{ c.title || '无标题' }}</li></ul>
      </section>
      <section class="mini-card">
        <h4>推荐热点（{{ saved.length }}）</h4>
        <ul><li v-for="h in saved.slice(0,5)" :key="h.id">{{ h.recommendedTopic || h.hotspotTitle }}</li></ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.tab-panel { display: grid; gap: 16px; }
.panel-header { display: flex; justify-content: space-between; gap: 12px; }
.panel-header h3 { margin: 0; font-size: 26px; }
.panel-header p { margin: 8px 0 0; color: #9cb3d7; }
.header-actions, .actions { display: flex; gap: 10px; }
.form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.field { display: grid; gap: 8px; }
.field-full { grid-column: 1 / -1; }
.row { display: flex; gap: 8px; }
.field span { color: #9db4d8; font-size: 12px; }
.field input, .field select, .field textarea { min-height: 42px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(149,181,255,0.16); background: rgba(255,255,255,0.03); color: #edf5ff; }
.warning { margin: 0; color: #ffc1a8; }
.notice { margin: 0; color: #7ee787; }
.ghost-btn, .primary-btn { min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); cursor: pointer; font-weight: 600; }
.ghost-btn { background: rgba(255,255,255,0.03); color: #eaf3ff; }
.primary-btn { background: linear-gradient(135deg, #79f0d5, #47b9ff); color: #08111f; }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }
.mini-card { border: 1px solid rgba(149,181,255,0.16); border-radius: 10px; padding: 10px; }
.mini-card h4 { margin: 0 0 8px 0; }
.mini-card ul { margin: 0; padding-left: 16px; }
@media (max-width: 1100px) { .panel-header, .header-actions, .actions { flex-direction: column; align-items: stretch; } .form-grid, .grid-3 { grid-template-columns: 1fr; } }
</style>
