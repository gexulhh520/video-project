<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { HotspotRadarAccount, HotspotRadarCandidateSummary } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";

const accounts = ref<HotspotRadarAccount[]>([]);
const router = useRouter();
const accountId = ref("");
const rows = ref<HotspotRadarCandidateSummary[]>([]);

onMounted(async () => {
  accounts.value = await desktopApi.hotspotRadarListAccounts();
  accountId.value = accounts.value[0]?.id || "";
  await load();
});

async function load(): Promise<void> {
  rows.value = accountId.value ? await desktopApi.hotspotRadarListCandidates(accountId.value) : [];
}
</script>

<template>
  <div class="page">
    <div class="page-actions">
      <button @click="router.push('/tools/hotspot-radar')">返回热点雷达</button>
      <button @click="router.push('/tools/content-studio')">返回内容创作工作台</button>
    </div>
    <h2>热点雷达 / 候选热点</h2>
    <select v-model="accountId" @change="load">
      <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.accountName }}</option>
    </select>
    <table class="tbl"><thead><tr><th>标题</th><th>来源</th><th>关键词</th><th>粗筛</th><th>精筛</th><th>分数</th></tr></thead>
      <tbody><tr v-for="c in rows" :key="c.id"><td>{{ c.title }}</td><td>{{ c.source }}</td><td>{{ c.matchedKeyword }}</td><td>{{ c.roughDecision || '-' }}</td><td>{{ c.finalDecision || '-' }}</td><td>{{ c.finalScore || 0 }}</td></tr></tbody>
    </table>
  </div>
</template>

<style scoped>
.page{height:100%;overflow:auto;padding:16px;color:#e6edf3}.tbl{width:100%;border-collapse:collapse}.tbl th,.tbl td{border:1px solid #30363d;padding:6px}
select{background:#0d1117;color:#e6edf3;border:1px solid #30363d;padding:6px;margin-bottom:8px}
.page-actions{margin-bottom:8px}
</style>
