<script setup lang="ts">
import { computed } from "vue";
import type { TaskProgress } from "../../../main/types/app.types";

const props = defineProps<{
  progress: TaskProgress;
}>();

const width = computed(() => `${Math.max(0, Math.min(100, props.progress.progress))}%`);
</script>

<template>
  <section class="task-progress">
    <div class="progress-meta">
      <div>
        <span class="label">任务进度</span>
        <strong>{{ props.progress.message }}</strong>
      </div>
      <span class="value">{{ props.progress.progress }}%</span>
    </div>
    <div class="track">
      <div class="fill" :style="{ width }"></div>
    </div>
  </section>
</template>

<style scoped>
.task-progress {
  padding: 18px 22px;
  border-radius: 20px;
  border: 1px solid rgba(128, 170, 255, 0.14);
  background: rgba(9, 15, 25, 0.92);
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}

.label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #89a6cf;
}

strong {
  font-size: 14px;
}

.value {
  font-size: 16px;
  font-weight: 700;
  color: #74c4ff;
}

.track {
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
}

.fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #58d4ff, #5c7bff);
  transition: width 180ms ease;
}
</style>
