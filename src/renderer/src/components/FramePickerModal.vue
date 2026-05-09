<script setup lang="ts">
import { ref, watch } from "vue";
import type { FramePreviewResult } from "../../../main/types/app.types";

const props = defineProps<{
  open: boolean;
  loading: boolean;
  saving: boolean;
  timeSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  preview: FramePreviewResult | null;
  sectionLabel: string;
}>();

const emit = defineEmits<{
  close: [];
  changeTime: [timeSeconds: number];
  confirm: [];
}>();

const sliderValue = ref(String(props.timeSeconds));

watch(
  () => props.timeSeconds,
  (value) => {
    sliderValue.value = String(value);
  },
  { immediate: true }
);

function handleSliderInput(value: string): void {
  sliderValue.value = value;
  emit("changeTime", Number(value));
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <header class="modal-header">
        <div>
          <span class="eyebrow">Frame Picker</span>
          <h3>从视频重新选帧</h3>
          <p>{{ sectionLabel }}</p>
        </div>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </header>

      <div class="preview-panel">
        <img v-if="preview?.imageDataUrl" :src="preview.imageDataUrl" alt="当前帧预览" />
        <div v-else class="preview-placeholder">
          {{ loading ? "正在抽取预览帧..." : "拖动时间轴后会显示帧预览" }}
        </div>
      </div>

      <div class="slider-panel">
        <div class="time-row">
          <span>{{ minSeconds.toFixed(1) }}s</span>
          <strong>{{ timeSeconds.toFixed(1) }}s</strong>
          <span>{{ maxSeconds.toFixed(1) }}s</span>
        </div>
        <input
          class="slider"
          type="range"
          :min="minSeconds"
          :max="maxSeconds"
          :step="0.2"
          :value="sliderValue"
          @input="handleSliderInput(($event.target as HTMLInputElement).value)"
        />
      </div>

      <footer class="modal-footer">
        <button class="ghost-btn" @click="emit('close')">取消</button>
        <button class="primary-btn" :disabled="loading || saving || !preview" @click="emit('confirm')">
          {{ saving ? "保存中..." : "使用这一帧" }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(3, 8, 16, 0.74);
  backdrop-filter: blur(6px);
}

.modal-card {
  width: min(920px, calc(100vw - 48px));
  max-height: min(860px, calc(100vh - 48px));
  padding: 24px;
  overflow: auto;
  border-radius: 28px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: linear-gradient(180deg, rgba(14, 21, 36, 0.98), rgba(8, 13, 24, 0.98));
  box-shadow: 0 36px 80px rgba(0, 0, 0, 0.42);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #79c8ff;
}

.modal-header h3 {
  margin: 10px 0 8px;
  font-size: 30px;
}

.modal-header p {
  margin: 0;
  color: #98afd2;
}

.close-btn,
.ghost-btn,
.primary-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  cursor: pointer;
  font-weight: 600;
}

.close-btn,
.ghost-btn {
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
}

.primary-btn {
  background: linear-gradient(135deg, #6bc3ff, #3f7df7);
  color: #08111f;
}

.primary-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.preview-panel {
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
}

.preview-panel img,
.preview-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 9;
}

.preview-panel img {
  object-fit: cover;
}

.preview-placeholder {
  color: #93abd0;
}

.slider-panel {
  margin-top: 20px;
  padding: 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(149, 181, 255, 0.12);
}

.time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  color: #9db4d8;
}

.time-row strong {
  color: #eef5ff;
}

.slider {
  width: 100%;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
</style>
