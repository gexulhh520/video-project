<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { HotspotRadarAccount, HotspotRadarTaskSummary } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";

const accounts = ref<HotspotRadarAccount[]>([]);
const accountId = ref("");
const tasks = ref<HotspotRadarTaskSummary[]>([]);

onMounted(async () => {
  accounts.value = await desktopApi.hotspotRadarListAccounts();
  accountId.value = accounts.value[0]?.id || "";
  await load();
});

async function load(): Promise<void> {
  tasks.value = accountId.value ? await desktopApi.hotspotRadarListTasks(accountId.value) : [];
}
</script>

<template>
  <div class="page">
    <h2>热点雷达 / 任务记录</h2>
    <select v-model="accountId" @change="load">
      <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.accountName }}</option>
    </select>
    <table class="tbl"><thead><tr><th>ID</th><th>状态</th><th>raw</th><th>标准化</th><th>去重后</th><th>saved</th></tr></thead>
      <tbody><tr v-for="t in tasks" :key="t.id"><td>{{ t.id }}</td><td>{{ t.status }}</td><td>{{ t.rawFileCount }}</td><td>{{ t.standardizedCount }}</td><td>{{ t.dedupedCount }}</td><td>{{ t.savedCount }}</td></tr></tbody>
    </table>
  </div>
</template>

<style scoped>
.page{padding:16px;color:#e6edf3}.tbl{width:100%;border-collapse:collapse}.tbl th,.tbl td{border:1px solid #30363d;padding:6px}
select{background:#0d1117;color:#e6edf3;border:1px solid #30363d;padding:6px;margin-bottom:8px}
</style>
