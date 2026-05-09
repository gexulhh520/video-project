<script setup lang="ts">
import { computed } from "vue";
import type { DraftSummary } from "../../../main/types/app.types";

const props = defineProps<{
  drafts: DraftSummary[];
  activeDraftId: string | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  open: [draftId: string];
  refresh: [];
}>();

const hasDrafts = computed(() => props.drafts.length > 0);

function toFileUrl(path?: string): string {
  if (!path) {
    return "";
  }

  return encodeURI(`file:///${path.replace(/\\/g, "/")}`);
}
</script>

<template>
  <section class="draft-shelf">
    <div class="shelf-header">
      <div>
        <span class="kicker">Draft Box</span>
        <h3>草稿箱</h3>
      </div>
      <button class="refresh-btn" :disabled="loading" @click="emit('refresh')">
        {{ loading ? "刷新中" : "刷新" }}
      </button>
    </div>

    <div v-if="!hasDrafts" class="empty-state">
      <strong>还没有草稿记录</strong>
      <p>完成一次生成后，这里会保留每次的图文结果，重启后也能再打开。</p>
    </div>

    <div v-else class="draft-list">
      <button
        v-for="draft in drafts"
        :key="draft.draftId"
        class="draft-item"
        :class="{ active: draft.draftId === activeDraftId }"
        @click="emit('open', draft.draftId)"
      >
        <img v-if="draft.coverImagePath" class="thumb" :src="toFileUrl(draft.coverImagePath)" :alt="draft.title" />
        <div v-else class="thumb thumb-placeholder">No Cover</div>
        <div class="draft-meta">
          <strong>{{ draft.title }}</strong>
          <span>{{ new Date(draft.createdAt).toLocaleString() }}</span>
          <span>{{ draft.sectionCount }} 个段落</span>
        </div>
      </button>
    </div>
  </section>
</template>

<style scoped>
.draft-shelf {
  padding: 22px;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(13, 21, 36, 0.95), rgba(10, 16, 28, 0.95));
  border: 1px solid rgba(146, 180, 255, 0.14);
  min-height: 260px;
}

.shelf-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.kicker {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #78c0ff;
}

.shelf-header h3 {
  margin: 8px 0 0;
  font-size: 24px;
}

.refresh-btn {
  min-width: 72px;
  min-height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
  cursor: pointer;
}

.refresh-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.empty-state {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
  color: #a7bbdc;
}

.empty-state strong {
  display: block;
  margin-bottom: 8px;
  color: #edf5ff;
}

.empty-state p {
  margin: 0;
  line-height: 1.7;
}

.draft-list {
  display: grid;
  gap: 12px;
  max-height: 360px;
  overflow: auto;
}

.draft-item {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 14px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.025);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.draft-item.active {
  border-color: rgba(104, 175, 255, 0.5);
  background: rgba(73, 138, 255, 0.08);
}

.thumb {
  width: 88px;
  height: 66px;
  border-radius: 12px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.04);
}

.thumb-placeholder {
  display: grid;
  place-items: center;
  color: #90a7cb;
  font-size: 12px;
}

.draft-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.draft-meta strong {
  font-size: 14px;
  line-height: 1.5;
}

.draft-meta span {
  color: #9db4d8;
  font-size: 12px;
}
</style>
