<script setup lang="ts">
import { computed } from "vue";
import type { ContentStudioTask } from "../../../../main/types/content-studio.types";

const props = defineProps<{
  open: boolean;
  tasks: ContentStudioTask[];
  loading: boolean;
  selectingTaskId: string | null;
}>();

const emit = defineEmits<{
  close: [];
  select: [taskId: string];
}>();

const hasTasks = computed(() => props.tasks.length > 0);

function getParagraphCount(task: ContentStudioTask): number {
  return task.result?.paragraphs.length ?? 0;
}

function hasImagePlan(task: ContentStudioTask): boolean {
  return Boolean(task.result?.paragraphs.some((paragraph) => paragraph.imagePlan));
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
</script>

<template>
  <teleport to="body">
    <div v-if="props.open" class="modal-mask" @click.self="emit('close')">
      <section class="modal-panel">
        <header class="modal-header">
          <div>
            <h3>选择文章</h3>
            <p>仅展示“话题成文 + 已完成 + 有结果”的任务。</p>
          </div>
          <button class="ghost-btn" @click="emit('close')">关闭</button>
        </header>

        <p v-if="props.loading" class="hint">加载中...</p>
        <p v-else-if="!hasTasks" class="hint">暂无可选文章，请先在“话题成文”生成至少一篇文章。</p>

        <div v-else class="task-list">
          <article v-for="task in props.tasks" :key="task.taskId" class="task-item">
            <p class="title">{{ task.result?.title || task.title }}</p>
            <p class="meta">任务ID：{{ task.taskId }}</p>
            <p class="meta">段落数：{{ getParagraphCount(task) }} · 配图计划：{{ hasImagePlan(task) ? "有" : "无" }}</p>
            <p class="meta">生成时间：{{ formatTime(task.createdAt) }}</p>
            <button class="primary-btn" :disabled="props.selectingTaskId === task.taskId" @click="emit('select', task.taskId)">
              {{ props.selectingTaskId === task.taskId ? "选择中..." : "选择" }}
            </button>
          </article>
        </div>
      </section>
    </div>
  </teleport>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(5, 8, 14, 0.68);
  display: grid;
  place-items: center;
  padding: 16px;
  z-index: 80;
}

.modal-panel {
  width: min(940px, 100%);
  max-height: 82vh;
  overflow: auto;
  border-radius: 14px;
  border: 1px solid rgba(149, 181, 255, 0.2);
  background: #0f1725;
  padding: 16px;
  display: grid;
  gap: 14px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.modal-header h3 {
  margin: 0;
  font-size: 22px;
}

.modal-header p {
  margin: 8px 0 0;
  color: #9cb3d7;
}

.hint {
  margin: 0;
  color: #9cb3d7;
}

.task-list {
  display: grid;
  gap: 10px;
}

.task-item {
  border: 1px solid rgba(149, 181, 255, 0.14);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 8px;
}

.title {
  margin: 0;
  color: #eaf3ff;
  font-size: 16px;
  font-weight: 700;
}

.meta {
  margin: 0;
  color: #9cb3d7;
  font-size: 13px;
}

.ghost-btn,
.primary-btn {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(140, 173, 247, 0.18);
  cursor: pointer;
  font-weight: 600;
}

.ghost-btn {
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
}

.primary-btn {
  justify-self: start;
  background: linear-gradient(135deg, #79f0d5, #47b9ff);
  color: #08111f;
}
</style>
