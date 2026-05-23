<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import type { HotspotRadarSavedSummary } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";

const route = useRoute();
const rows = ref<HotspotRadarSavedSummary[]>([]);

const accountId = computed(() => String(route.query.accountId || ""));
const savedId = computed(() => String(route.params.savedId || ""));
const item = computed(() => rows.value.find((x) => x.id === savedId.value) || null);

onMounted(async () => {
  if (!accountId.value) return;
  rows.value = await desktopApi.hotspotRadarListSaved(accountId.value);
});
</script>

<template>
  <div class="page">
    <h2>热点雷达 / 推荐热点详情</h2>
    <div v-if="item" class="card">
      <p><strong>ID：</strong>{{ item.id }}</p>
      <p><strong>推荐话题：</strong>{{ item.recommendedTopic }}</p>
      <p><strong>热点标题：</strong>{{ item.hotspotTitle }}</p>
      <p><strong>来源：</strong>{{ item.source }}</p>
      <p><strong>决策：</strong>{{ item.decision }}</p>
      <p><strong>分数：</strong>{{ item.score }}</p>
      <p><strong>文件：</strong>{{ item.filePath }}</p>
    </div>
    <p v-else>未找到对应热点。</p>
  </div>
</template>

<style scoped>
.page{padding:16px;color:#e6edf3}.card{border:1px solid #30363d;border-radius:8px;padding:12px}
</style>
