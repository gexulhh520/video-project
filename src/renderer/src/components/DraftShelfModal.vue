<script setup lang="ts">
import DraftShelf from "./DraftShelf.vue";
import type { DraftSummary } from "../../../main/types/app.types";

defineProps<{
  open: boolean;
  drafts: DraftSummary[];
  activeDraftId: string | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  close: [];
  openDraft: [draftId: string];
  refresh: [];
}>();

function handleOpenDraft(draftId: string): void {
  emit("openDraft", draftId);
  emit("close");
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Draft Box</span>
          <h3>草稿箱</h3>
        </div>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </div>

      <DraftShelf
        :drafts="drafts"
        :active-draft-id="activeDraftId"
        :loading="loading"
        @open="handleOpenDraft"
        @refresh="emit('refresh')"
      />
    </section>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: rgba(3, 8, 16, 0.74);
  backdrop-filter: blur(6px);
}

.modal-card {
  width: min(860px, calc(100vw - 48px));
  max-height: min(820px, calc(100vh - 48px));
  padding: 22px;
  overflow: auto;
  border-radius: 28px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: linear-gradient(180deg, rgba(14, 21, 36, 0.98), rgba(8, 13, 24, 0.98));
  box-shadow: 0 36px 80px rgba(0, 0, 0, 0.42);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #79c8ff;
}

.modal-header h3 {
  margin: 8px 0 0;
  font-size: 28px;
  color: #edf5ff;
}

.close-btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
  cursor: pointer;
}
</style>
