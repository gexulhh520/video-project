<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { HotspotRadarAccount, HotspotRadarSavedSummary } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";

const router = useRouter();
const accounts = ref<HotspotRadarAccount[]>([]);
const accountId = ref("");
const rows = ref<HotspotRadarSavedSummary[]>([]);

onMounted(async () => {
  accounts.value = await desktopApi.hotspotRadarListAccounts();
  accountId.value = accounts.value[0]?.id || "";
  await load();
});

async function load(): Promise<void> {
  rows.value = accountId.value ? await desktopApi.hotspotRadarListSaved(accountId.value) : [];
}

function openDetail(id: string): void {
  router.push(`/tools/hotspot-radar/saved/${id}?accountId=${accountId.value}`);
}
</script>

<template>
  <div class="page">
    <div class="page-actions">
      <button @click="router.push('/tools/hotspot-radar')">返回热点雷达</button>
      <button @click="router.push('/tools/content-studio')">返回内容创作工作台</button>
    </div>
    <h2>热点雷达 / 推荐热点</h2>
    <select v-model="accountId" @change="load">
      <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.accountName }}</option>
    </select>
    <table class="tbl"><thead><tr><th>推荐话题</th><th>热点标题</th><th>来源</th><th>分数</th><th>操作</th></tr></thead>
      <tbody><tr v-for="h in rows" :key="h.id"><td>{{ h.recommendedTopic }}</td><td>{{ h.hotspotTitle }}</td><td>{{ h.source }}</td><td>{{ h.score }}</td><td><button @click="openDetail(h.id)">详情</button></td></tr></tbody>
    </table>
  </div>
</template>

<style scoped>
.page{height:100%;overflow:auto;padding:16px;color:#e6edf3}.tbl{width:100%;border-collapse:collapse}.tbl th,.tbl td{border:1px solid #30363d;padding:6px}
select{background:#0d1117;color:#e6edf3;border:1px solid #30363d;padding:6px;margin-bottom:8px}
.page-actions{margin-bottom:8px}
</style>
