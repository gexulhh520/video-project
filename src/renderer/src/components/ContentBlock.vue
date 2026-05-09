<script setup lang="ts">
import { computed } from "vue";
import type { ContentBlock } from "../../../main/types/app.types";

const props = defineProps<{
  block: ContentBlock;
}>();

const imageSrc = computed(() => {
  if (props.block.type !== "image") {
    return "";
  }

  return encodeURI(`file:///${props.block.imagePath.replace(/\\/g, "/")}`);
});
</script>

<template>
  <article v-if="block.type === 'paragraph'" class="paragraph-block">
    <p>{{ block.text }}</p>
  </article>

  <figure v-else class="image-block">
    <img :src="imageSrc" :alt="block.caption ?? `段落配图 ${block.sectionId}`" />
    <figcaption>
      {{ block.caption ?? `抽帧时间 ${block.time.toFixed(1)}s` }}
    </figcaption>
  </figure>
</template>

<style scoped>
.paragraph-block {
  padding: 22px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(149, 181, 255, 0.12);
}

.paragraph-block p {
  margin: 0;
  line-height: 1.9;
  color: #dbe8fb;
  white-space: pre-wrap;
}

.image-block {
  margin: 0;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
}

.image-block img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.image-block figcaption {
  padding: 14px 18px 16px;
  font-size: 13px;
  color: #9eb6d9;
}
</style>
