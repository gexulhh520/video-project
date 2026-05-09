<script setup lang="ts">
import ContentBlock from "./ContentBlock.vue";
import type { PostDraft } from "../../../main/types/app.types";

defineProps<{
  draft: PostDraft | null;
}>();
</script>

<template>
  <section class="preview-shell">
    <div v-if="!draft" class="empty-state">
      <span class="eyebrow">Preview</span>
      <h2>图文预览会显示在这里</h2>
      <p>完成一次生成后，这里会展示标题、正文段落和自动抽取的配图。</p>
    </div>

    <div v-else class="preview-content">
      <header class="preview-header">
        <span class="eyebrow">Draft Ready</span>
        <h1>{{ draft.title }}</h1>
        <p>共 {{ draft.sections.length }} 个段落，创建于 {{ new Date(draft.createdAt).toLocaleString() }}</p>
      </header>

      <div class="blocks">
        <ContentBlock v-for="block in draft.contentBlocks" :key="block.blockId" :block="block" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.preview-shell {
  height: 100%;
  padding: 28px;
  overflow: auto;
  border-radius: 32px;
  background:
    radial-gradient(circle at top right, rgba(78, 151, 255, 0.16), transparent 26%),
    linear-gradient(180deg, rgba(14, 21, 36, 0.98), rgba(8, 13, 24, 0.98));
  border: 1px solid rgba(154, 186, 255, 0.12);
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #79c8ff;
}

h2,
h1 {
  margin: 10px 0 12px;
}

.empty-state p,
.preview-header p {
  margin: 0;
  color: #98afd2;
  line-height: 1.7;
}

.preview-header h1 {
  font-size: 34px;
  line-height: 1.25;
}

.blocks {
  display: grid;
  gap: 18px;
  margin-top: 26px;
}
</style>
