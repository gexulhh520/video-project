<script setup lang="ts">
import { computed } from "vue";
import type { ContentStudioTabKey, ContentStudioTaskSummary } from "../../../../main/types/content-studio.types";

const props = defineProps<{
  open: boolean;
  loading: boolean;
  deletingTaskId: string | null;
  tasks: ContentStudioTaskSummary[];
  page: number;
  pageSize: number;
  activeTab: ContentStudioTabKey;
}>();

const emit = defineEmits<{
  close: [];
  changePage: [page: number];
  delete: [taskId: string];
  open: [taskId: string];
  changeTab: [tab: ContentStudioTabKey];
}>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.tasks.length / props.pageSize)));
const pagedTasks = computed(() => {
  const start = (props.page - 1) * props.pageSize;
  return props.tasks.slice(start, start + props.pageSize);
});

const tabOptions: Array<{ key: ContentStudioTabKey; label: string }> = [
  { key: "topic", label: "话题成文" },
  { key: "material", label: "素材二创" }
];

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
</script>

<template>
  <div v-if="props.open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <header class="modal-header">
        <div>
          <h3>历史任务</h3>
          <p>支持按话题成文/素材二创筛选与删除。</p>
        </div>
        <button class="ghost-btn" @click="emit('close')">关闭</button>
      </header>

      <div class="tabs">
        <button
          v-for="tab in tabOptions"
          :key="tab.key"
          class="ghost-btn"
          :class="{ active: props.activeTab === tab.key }"
          @click="emit('changeTab', tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <p v-if="props.loading" class="hint">加载中...</p>
      <p v-else-if="!props.tasks.length" class="hint">暂无历史任务。</p>

      <div v-else class="task-list">
        <article v-for="task in pagedTasks" :key="task.taskId" class="task-item">
          <p class="title">{{ task.title }}</p>
          <p class="meta">任务ID：{{ task.taskId }}</p>
          <p class="meta">类型：{{ task.tab }}</p>
          <p class="meta">状态：{{ task.status }}</p>
          <p class="meta">创建时间：{{ formatTime(task.createdAt) }}</p>
          <p class="meta">更新时间：{{ formatTime(task.updatedAt) }}</p>
          <div class="actions">
            <button class="ghost-btn" @click="emit('open', task.taskId)">打开</button>
            <button class="danger-btn" :disabled="props.deletingTaskId === task.taskId" @click="emit('delete', task.taskId)">
              {{ props.deletingTaskId === task.taskId ? "删除中..." : "删除" }}
            </button>
          </div>
        </article>
      </div>

      <footer v-if="props.tasks.length" class="pager">
        <button class="ghost-btn" :disabled="props.page <= 1" @click="emit('changePage', props.page - 1)">上一页</button>
        <span>第 {{ props.page }} / {{ totalPages }} 页</span>
        <button class="ghost-btn" :disabled="props.page >= totalPages" @click="emit('changePage', props.page + 1)">下一页</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; background: rgba(5,10,20,0.7); }
.modal-card { width: min(920px, calc(100vw - 40px)); max-height: 86vh; overflow: auto; padding: 20px; border-radius: 16px; border: 1px solid rgba(149,181,255,0.16); background: #0e1626; display: grid; gap: 12px; }
.modal-header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.modal-header h3 { margin: 0; }
.modal-header p, .hint { margin: 6px 0 0; color: #9cb3d7; }
.tabs { display: flex; gap: 8px; }
.task-list { display: grid; gap: 10px; }
.task-item { border: 1px solid rgba(149,181,255,0.14); border-radius: 12px; padding: 12px; display: grid; gap: 7px; }
.title { margin: 0; font-size: 16px; font-weight: 700; color: #eaf3ff; }
.meta { margin: 0; color: #9cb3d7; font-size: 13px; }
.actions { display: flex; gap: 8px; }
.pager { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pager span { color: #9cb3d7; font-size: 13px; }
.ghost-btn, .danger-btn { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); cursor: pointer; font-weight: 600; background: rgba(255,255,255,0.03); color: #eaf3ff; }
.ghost-btn.active { border-color: rgba(108, 174, 255, 0.56); background: rgba(108, 174, 255, 0.12); }
.danger-btn { background: rgba(255, 110, 110, 0.12); color: #ffd8d8; border-color: rgba(255,110,110,0.26); }
</style>

