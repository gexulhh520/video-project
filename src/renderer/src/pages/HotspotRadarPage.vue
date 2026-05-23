<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import type { HotspotRadarAccount, HotspotRadarGlobalConfig, HotspotRadarWatcher, OpenCliProvider, HotspotRadarTaskSummary, HotspotRadarCandidateSummary, HotspotRadarSavedSummary } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";

const accounts = ref<HotspotRadarAccount[]>([]);
const selectedAccountId = ref("");
const watcherId = ref("watcher_default");
const watchers = ref<HotspotRadarWatcher[]>([]);
const watcherName = ref("默认监听器");
const keywordsText = ref("OpenAI,ChatGPT,Claude");
const sourcesJson = ref(`[\n  {"source":"weibo","enabled":true,"enabledCommands":["hot","search"],"topLimit":20,"searchLimit":5},\n  {"source":"zhihu","enabled":true,"enabledCommands":["hot","search"],"topLimit":20,"searchLimit":5}\n]`);
const runResult = ref("");
const tasks = ref<HotspotRadarTaskSummary[]>([]);
const candidates = ref<HotspotRadarCandidateSummary[]>([]);
const saved = ref<HotspotRadarSavedSummary[]>([]);
const notice = ref("");

const config = ref<HotspotRadarGlobalConfig>({
  opencliProfile: "default",
  dedupeLookbackDays: 15,
  llm: { provider: "chatgpt", profile: "", model: "", timeoutMs: 120000, intervalMs: 3000 }
});

const providerOptions: OpenCliProvider[] = ["chatgpt", "gemini", "claude", "grok", "doubao", "yuanbao"];

onMounted(async () => {
  await refreshAccounts();
  config.value = await desktopApi.hotspotRadarGetConfig();
});

async function refreshAccounts(): Promise<void> {
  accounts.value = await desktopApi.hotspotRadarListAccounts();
  if (!selectedAccountId.value && accounts.value.length) {
    selectedAccountId.value = accounts.value[0].id;
  }
  if (selectedAccountId.value) {
    watchers.value = await desktopApi.hotspotRadarListWatchers(selectedAccountId.value);
    await refreshIndexes();
  }
}

async function createDemoAccount(): Promise<void> {
  const id = `account_${Date.now().toString().slice(-6)}`;
  await desktopApi.hotspotRadarCreateAccount({
    id,
    accountName: `热点账号-${id.slice(-4)}`,
    platform: "公众号",
    contentStyle: "观点分析 + 实操拆解",
    mainTopics: ["AI", "互联网"],
    targetAudience: ["创作者", "从业者"],
    tone: "理性、实用",
    avoidTopics: ["低俗猎奇"],
    preferredContentTypes: ["趋势判断"],
    enabled: true
  });
  notice.value = "已创建示例账号";
  await refreshAccounts();
  selectedAccountId.value = id;
}

async function saveConfig(): Promise<void> {
  config.value = await desktopApi.hotspotRadarSaveConfig(config.value);
  notice.value = "全局配置已保存";
}

async function testLlm(): Promise<void> {
  const result = await desktopApi.hotspotRadarTestLlm();
  notice.value = result.ready ? `LLM测试成功：${result.message}` : `LLM测试失败：${result.message}`;
}

async function saveWatcher(): Promise<void> {
  if (!selectedAccountId.value) return;
  const keywords = keywordsText.value.split(",").map((v) => v.trim()).filter(Boolean);
  const watcher: Omit<HotspotRadarWatcher, "createdAt" | "updatedAt"> = {
    id: watcherId.value,
    accountId: selectedAccountId.value,
    name: watcherName.value,
    description: "前端创建",
    enabled: true,
    sources: (() => { try { const v = JSON.parse(sourcesJson.value); return Array.isArray(v) ? v : []; } catch { return []; } })(),
    keywords,
    runIntervalMinutes: 60,
    dedupeLookbackDays: config.value.dedupeLookbackDays,
    maxCandidatesPerRun: 200,
    lastRunAt: ""
  };
  await desktopApi.hotspotRadarUpsertWatcher(watcher);
  notice.value = "监听器已保存";
  watchers.value = await desktopApi.hotspotRadarListWatchers(selectedAccountId.value);
}

async function refreshIndexes(): Promise<void> {
  if (!selectedAccountId.value) return;
  tasks.value = await desktopApi.hotspotRadarListTasks(selectedAccountId.value);
  candidates.value = await desktopApi.hotspotRadarListCandidates(selectedAccountId.value);
  saved.value = await desktopApi.hotspotRadarListSaved(selectedAccountId.value);
}

async function runManual(): Promise<void> {
  if (!selectedAccountId.value) return;
  const result = await desktopApi.hotspotRadarRunManualTask(selectedAccountId.value, watcherId.value);
  runResult.value = JSON.stringify(result, null, 2);
  await refreshIndexes();
}

async function runScheduled(): Promise<void> {
  const result = await desktopApi.hotspotRadarRunScheduledTasks();
  runResult.value = JSON.stringify(result, null, 2);
  await refreshIndexes();
}



async function deleteSelectedAccount(): Promise<void> {
  if (!selectedAccountId.value) return;
  await desktopApi.hotspotRadarDeleteAccount(selectedAccountId.value);
  notice.value = "账号已删除";
  selectedAccountId.value = "";
  watchers.value = [];
  tasks.value = [];
  candidates.value = [];
  saved.value = [];
  await refreshAccounts();
}

async function deleteWatcher(id: string): Promise<void> {
  if (!selectedAccountId.value) return;
  await desktopApi.hotspotRadarDeleteWatcher(selectedAccountId.value, id);
  notice.value = `监听器 ${id} 已删除`;
  watchers.value = await desktopApi.hotspotRadarListWatchers(selectedAccountId.value);
}



async function rebuildIndexes(): Promise<void> {
  if (!selectedAccountId.value) return;
  const result = await desktopApi.hotspotRadarRebuildIndexes(selectedAccountId.value);
  notice.value = `索引已重建：task=${result.taskCount}, candidate=${result.candidateCount}, saved=${result.savedCount}`;
  await refreshIndexes();
}

async function cleanup(): Promise<void> {
  const result = await desktopApi.hotspotRadarCleanup(config.value.dedupeLookbackDays);
  runResult.value = JSON.stringify(result, null, 2);
  await refreshIndexes();
}
</script>

<template>
  <div class="hotspot-page">
    <h2>热点雷达（开发版）</h2>
    <p class="notice" v-if="notice">{{ notice }}</p>
    <div class="nav-links">
      <RouterLink to="/tools/hotspot-radar/tasks">任务记录页</RouterLink>
      <RouterLink to="/tools/hotspot-radar/candidates">候选热点页</RouterLink>
      <RouterLink to="/tools/hotspot-radar/saved">推荐热点页</RouterLink>
    </div>

    <section class="card">
      <h3>账号</h3>
      <button @click="createDemoAccount">创建示例账号</button>
      <button @click="refreshAccounts">刷新</button>
      <button @click="deleteSelectedAccount" :disabled="!selectedAccountId">删除账号</button>
      <select v-model="selectedAccountId">
        <option value="" disabled>请选择账号</option>
        <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.accountName }} ({{ acc.id }})</option>
      </select>
    </section>

    <section class="card">
      <h3>全局配置</h3>
      <label>OpenCLI Profile <input v-model="config.opencliProfile" /></label>
      <label>去重天数 <input v-model.number="config.dedupeLookbackDays" type="number" min="1" /></label>
      <label>LLM Provider
        <select v-model="config.llm.provider"><option v-for="p in providerOptions" :key="p" :value="p">{{ p }}</option></select>
      </label>
      <label>LLM Profile <input v-model="config.llm.profile" /></label>
      <label>LLM Model <input v-model="config.llm.model" /></label>
      <div>
        <button @click="saveConfig">保存配置</button>
        <button @click="testLlm">测试LLM</button>
      </div>
    </section>

    <section class="card">
      <h3>监听器</h3>
      <label>监听器ID <input v-model="watcherId" /></label>
      <label>监听器名称 <input v-model="watcherName" /></label>
      <label>关键词（逗号分隔） <input v-model="keywordsText" /></label>
      <label>采集平台配置（JSON） <textarea v-model="sourcesJson" rows="6"></textarea></label>
      <button @click="saveWatcher" :disabled="!selectedAccountId">保存监听器</button>
    </section>


    <section class="card" v-if="selectedAccountId">
      <h3>监听器列表（{{ watchers.length }}）</h3>
      <table class="tbl"><thead><tr><th>ID</th><th>名称</th><th>启用</th><th>间隔</th><th>操作</th></tr></thead>
      <tbody>
        <tr v-for="w in watchers" :key="w.id">
          <td>{{ w.id }}</td><td>{{ w.name }}</td><td>{{ w.enabled ? "是" : "否" }}</td><td>{{ w.runIntervalMinutes }}m</td>
          <td><button @click="deleteWatcher(w.id)">删除</button></td>
        </tr>
      </tbody></table>
    </section>

    <section class="card">
      <h3>运行</h3>
      <button @click="runManual" :disabled="!selectedAccountId">手动运行</button>
      <button @click="runScheduled">运行调度</button>
      <button @click="cleanup">清理历史</button>
      <button @click="rebuildIndexes" :disabled="!selectedAccountId">重建索引</button>
      <pre>{{ runResult }}</pre>
    </section>

    <section class="card" v-if="selectedAccountId">
      <h3>任务记录（{{ tasks.length }}）</h3>
      <table class="tbl"><thead><tr><th>ID</th><th>状态</th><th>raw</th><th>candidate</th><th>saved</th></tr></thead>
      <tbody><tr v-for="t in tasks.slice(0, 20)" :key="t.id"><td>{{ t.id }}</td><td>{{ t.status }}</td><td>{{ t.rawFileCount }}</td><td>{{ t.dedupedCount }}</td><td>{{ t.savedCount }}</td></tr></tbody></table>
    </section>

    <section class="card" v-if="selectedAccountId">
      <h3>候选热点（{{ candidates.length }}）</h3>
      <table class="tbl"><thead><tr><th>标题</th><th>来源</th><th>关键词</th><th>状态</th></tr></thead>
      <tbody><tr v-for="c in candidates.slice(0, 20)" :key="c.id"><td>{{ c.title }}</td><td>{{ c.source }}</td><td>{{ c.matchedKeyword }}</td><td>{{ c.status }}</td></tr></tbody></table>
    </section>

    <section class="card" v-if="selectedAccountId">
      <h3>推荐热点（{{ saved.length }}）</h3>
      <table class="tbl"><thead><tr><th>推荐话题</th><th>热点标题</th><th>来源</th><th>分数</th></tr></thead>
      <tbody><tr v-for="h in saved.slice(0, 20)" :key="h.id"><td>{{ h.recommendedTopic }}</td><td>{{ h.hotspotTitle }}</td><td>{{ h.source }}</td><td>{{ h.score }}</td></tr></tbody></table>
    </section>

  </div>
</template>

<style scoped>
.hotspot-page { padding: 16px; color: #e6edf3; }
.card { border: 1px solid #30363d; padding: 12px; border-radius: 8px; margin: 12px 0; display: grid; gap: 8px; }
input, select, textarea { background: #0d1117; border: 1px solid #30363d; color: #e6edf3; padding: 6px; }
button { margin-right: 8px; }
.notice { color: #7ee787; }
.nav-links{display:flex;gap:12px;margin:8px 0 12px;}
.nav-links a{color:#58a6ff;}
pre { background:#0d1117; border:1px solid #30363d; padding:8px; overflow:auto; }
.tbl{width:100%;border-collapse:collapse;font-size:12px;}
.tbl th,.tbl td{border:1px solid #30363d;padding:6px;text-align:left;}
</style>
