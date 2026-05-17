<script setup lang="ts">
import { computed } from "vue";
import type { ContentStudioTask } from "../../../../main/types/content-studio.types";

const props = defineProps<{
  tabReady: boolean;
  missingItems: string[];
  selectedTask: ContentStudioTask | null;
  copyingPublishDraft: boolean;
  exportingWord: boolean;
  exportingImages: boolean;
}>();

const emit = defineEmits<{
  openModelSettings: [];
  openRunLog: [];
  openArticlePicker: [];
  openImagePlan: [];
  openImageAssets: [];
  copyPublishDraft: [];
  openPublishPreview: [];
  exportWord: [];
  exportImages: [];
}>();

const summary = computed(() => {
  const task = props.selectedTask;
  if (!task || !task.result) {
    return null;
  }
  const paragraphCount = task.result.paragraphs.length;
  const hasCoverText = Boolean(task.result.coverText || task.result.coverSubText);
  const hasImagePlan = task.result.paragraphs.some((paragraph) => paragraph.imagePlan);
  const imageBindings = task.imageBindings?.length ?? 0;
  return {
    title: task.result.title || task.title,
    sourceTab: task.tab,
    paragraphCount,
    hasCoverText,
    hasImagePlan,
    imageBindings,
    createdAt: formatTime(task.createdAt),
    updatedAt: formatTime(task.updatedAt)
  };
});

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
</script>

<template>
  <section class="tab-panel">
    <header class="panel-header">
      <div>
        <h3>图文排版</h3>
        <p>管理配图计划、图片池与导出能力，保持主页面简洁。</p>
      </div>
      <div class="header-actions">
        <button class="ghost-btn" @click="emit('openRunLog')">运行记录</button>
        <button class="ghost-btn" @click="emit('openModelSettings')">模型配置</button>
      </div>
    </header>

    <p v-if="!props.tabReady" class="warning">当前配置未完成：{{ props.missingItems.join("、") || "请先配置模型" }}</p>

    <div class="placeholder-box">
      <div class="summary-header">
        <h4>当前文章摘要</h4>
        <button class="ghost-btn" @click="emit('openArticlePicker')">选择文章</button>
      </div>
      <p v-if="!summary">尚未选择文章，请先从“话题成文”已完成任务中选择一篇。</p>
      <div v-else class="summary-grid">
        <p><strong>标题：</strong>{{ summary.title }}</p>
        <p><strong>来源任务类型：</strong>{{ summary.sourceTab }}</p>
        <p><strong>段落数：</strong>{{ summary.paragraphCount }}</p>
        <p><strong>是否有封面文案：</strong>{{ summary.hasCoverText ? "是" : "否" }}</p>
        <p><strong>是否有配图计划：</strong>{{ summary.hasImagePlan ? "是" : "否" }}</p>
        <p><strong>已绑定图片数量：</strong>{{ summary.imageBindings }}</p>
        <p><strong>生成时间：</strong>{{ summary.createdAt }}</p>
        <p><strong>最后更新时间：</strong>{{ summary.updatedAt }}</p>
      </div>
      <div class="actions">
        <button class="ghost-btn" :disabled="!summary" @click="emit('openPublishPreview')">排版预览</button>
        <button class="ghost-btn" :disabled="!summary" @click="emit('openImagePlan')">配图计划</button>
        <button class="ghost-btn" :disabled="!summary" @click="emit('openImageAssets')">图片池</button>
        <button class="primary-btn" :disabled="!props.tabReady || !summary || props.copyingPublishDraft" @click="emit('copyPublishDraft')">
          {{ props.copyingPublishDraft ? "复制中..." : "复制发布稿" }}
        </button>
      </div>
      <div class="future-actions">
        <button class="ghost-btn" :disabled="!summary || props.exportingWord" @click="emit('exportWord')">
          {{ props.exportingWord ? "导出中..." : "Word 导出" }}
        </button>
        <button class="ghost-btn" :disabled="!summary || props.exportingImages" @click="emit('exportImages')">
          {{ props.exportingImages ? "导出中..." : "图片压缩包导出" }}
        </button>
        <button class="ghost-btn" disabled>AI 生成图片（后续支持）</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tab-panel { display: grid; gap: 16px; }
.panel-header { display: flex; justify-content: space-between; gap: 12px; }
.panel-header h3 { margin: 0; font-size: 26px; }
.panel-header p { margin: 8px 0 0; color: #9cb3d7; }
.header-actions, .actions { display: flex; gap: 10px; flex-wrap: wrap; }
.warning { margin: 0; color: #ffc1a8; }
.placeholder-box { padding: 16px; border-radius: 14px; border: 1px solid rgba(149,181,255,0.12); background: rgba(255,255,255,0.02); display: grid; gap: 14px; }
.placeholder-box p { margin: 0; color: #9cb3d7; }
.summary-header { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.summary-header h4 { margin: 0; font-size: 18px; }
.summary-grid { display: grid; gap: 8px; }
.future-actions { display: flex; gap: 10px; flex-wrap: wrap; opacity: 0.72; }
.ghost-btn, .primary-btn { min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); cursor: pointer; font-weight: 600; }
.ghost-btn { background: rgba(255,255,255,0.03); color: #eaf3ff; }
.primary-btn { background: linear-gradient(135deg, #79f0d5, #47b9ff); color: #08111f; }
@media (max-width: 1100px) { .panel-header, .header-actions, .actions { flex-direction: column; align-items: stretch; } }
</style>
