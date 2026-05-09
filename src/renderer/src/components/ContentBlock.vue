<script setup lang="ts">
import { ref, watchEffect } from "vue";
import type { ContentBlock } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";

const props = defineProps<{
  block: ContentBlock;
}>();

const imageSrc = ref("");

watchEffect(async () => {
  if (props.block.type !== "image") {
    imageSrc.value = "";
    return;
  }

  imageSrc.value = await desktopApi.readImageAsDataUrl(props.block.imagePath);
});
</script>

<template>
  <article v-if="block.type === 'paragraph'" class="paragraph-block">
    <p>{{ block.text }}</p>
  </article>

  <figure v-else class="image-block">
    <img v-if="imageSrc" :src="imageSrc" :alt="block.caption ?? `段落配图 ${block.sectionId}`" />
    <div v-else class="image-loading">图片加载中...</div>
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

.image-loading {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 9;
  color: #90a7cb;
}

.image-block figcaption {
  padding: 14px 18px 16px;
  font-size: 13px;
  color: #9eb6d9;
}
</style>
