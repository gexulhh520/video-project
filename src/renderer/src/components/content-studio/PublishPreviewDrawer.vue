<script setup lang="ts">
import { computed } from "vue";
import type { ContentStudioTask } from "../../../../main/types/content-studio.types";

const props = defineProps<{
  open: boolean;
  task: ContentStudioTask | null;
  imagePreviewMap: Record<string, string>;
}>();

const emit = defineEmits<{ close: [] }>();

const bindingsMap = computed(() => {
  const map = new Map<string, string>();
  for (const binding of props.task?.imageBindings ?? []) {
    map.set(binding.paragraphId, binding.assetId);
  }
  return map;
});
</script>

<template>
  <div class="drawer" :class="{ open: props.open }">
    <div class="drawer-mask" @click="emit('close')"></div>
    <aside class="drawer-panel">
      <header class="drawer-header">
        <h3>排版预览</h3>
        <button class="ghost-btn" @click="emit('close')">关闭</button>
      </header>

      <template v-if="props.task?.result">
        <section class="card">
          <p><strong>标题：</strong>{{ props.task.result.title || props.task.title }}</p>
          <p><strong>标题候选：</strong>{{ props.task.result.titleCandidates?.join(" / ") || "未提供" }}</p>
          <p><strong>封面主文案：</strong>{{ props.task.result.coverText || "未提供" }}</p>
          <p><strong>封面副文案：</strong>{{ props.task.result.coverSubText || "未提供" }}</p>
          <p><strong>封面风格建议：</strong>{{ props.task.result.coverStyleSuggestion || "未提供" }}</p>
          <p><strong>标签：</strong>{{ props.task.result.tags?.join("、") || "未提供" }}</p>
          <p><strong>风险提示：</strong>{{ props.task.result.riskNotes?.join("；") || "未提供" }}</p>
        </section>

        <section v-for="(paragraph, index) in props.task.result.paragraphs" :key="paragraph.paragraphId" class="card">
          <p><strong>段落 {{ index + 1 }}（{{ paragraph.paragraphId }}）</strong></p>
          <p class="text">{{ paragraph.text }}</p>
          <p><strong>配图说明：</strong>{{ paragraph.imagePlan?.caption || "未提供" }}</p>
          <p><strong>配图提示词：</strong>{{ paragraph.imagePlan?.prompt || "未提供" }}</p>
          <p><strong>当前图片状态：</strong>{{ bindingsMap.get(paragraph.paragraphId) ? `已绑定 ${bindingsMap.get(paragraph.paragraphId)}` : "未绑定" }}</p>
          <img
            v-if="bindingsMap.get(paragraph.paragraphId) && props.imagePreviewMap[bindingsMap.get(paragraph.paragraphId) || '']"
            class="thumb"
            :src="props.imagePreviewMap[bindingsMap.get(paragraph.paragraphId) || '']"
            alt="绑定图片预览"
          />
        </section>
      </template>
      <p v-else class="hint">请先选择文章。</p>
    </aside>
  </div>
</template>

<style scoped>
.drawer { position: fixed; inset: 0; z-index: 74; pointer-events: none; }
.drawer-mask { position: absolute; inset: 0; background: rgba(5,10,20,0.65); opacity: 0; transition: opacity .2s; }
.drawer-panel { position: absolute; top: 0; right: 0; width: min(760px, 100vw); height: 100%; background: #0e1626; border-left: 1px solid rgba(149,181,255,0.16); padding: 18px; overflow: auto; transform: translateX(100%); transition: transform .2s; display: grid; align-content: start; gap: 12px; }
.drawer.open { pointer-events: auto; }
.drawer.open .drawer-mask { opacity: 1; }
.drawer.open .drawer-panel { transform: translateX(0); }
.drawer-header { display: flex; justify-content: space-between; align-items: center; }
.drawer-header h3 { margin: 0; }
.card { border: 1px solid rgba(149,181,255,0.14); border-radius: 12px; padding: 12px; display: grid; gap: 6px; }
.card p { margin: 0; color: #9cb3d7; }
.text { white-space: pre-wrap; }
.hint { color: #9cb3d7; }
.thumb { width: 220px; max-width: 100%; border-radius: 8px; border: 1px solid rgba(149,181,255,0.2); }
.ghost-btn { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); background: rgba(255,255,255,0.03); color: #eaf3ff; cursor: pointer; }
</style>
