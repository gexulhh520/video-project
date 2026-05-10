<script setup lang="ts">
import { ref } from "vue";
import MosaicImageEditor from "./MosaicImageEditor.vue";

const props = defineProps<{
  open: boolean;
  sourceImageDataUrl: string;
  sourceImagePath: string;
  timeSeconds: number;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  useDirectly: [];
  saveMosaic: [imageBase64: string];
}>();

const showEditor = ref(false);

function handleClose(): void {
  showEditor.value = false;
  emit("close");
}

function handleUseDirectly(): void {
  emit("useDirectly");
}

function handleSaveMosaic(imageBase64: string): void {
  emit("saveMosaic", imageBase64);
}

function handleCancelEditor(): void {
  showEditor.value = false;
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="handleClose">
    <section class="modal-card">
      <header class="modal-header">
        <div>
          <span class="eyebrow">Mosaic Editor</span>
          <h3>涂抹马赛克编辑器</h3>
          <p>时间：{{ timeSeconds.toFixed(1) }}s</p>
        </div>
        <button class="close-btn" @click="handleClose">关闭</button>
      </header>

      <div v-if="!showEditor" class="action-panel">
        <p class="action-hint">选择操作方式：</p>
        <div class="action-buttons">
          <button class="action-btn direct-btn" @click="handleUseDirectly">
            直接使用当前帧
          </button>
          <button class="action-btn mosaic-btn" @click="showEditor = true">
            涂抹马赛克后使用
          </button>
        </div>
        <div class="preview-panel">
          <img :src="sourceImageDataUrl" alt="当前帧预览" />
        </div>
      </div>

      <div v-else class="editor-panel">
        <MosaicImageEditor
          :source-image-data-url="sourceImageDataUrl"
          :source-image-path="sourceImagePath"
          @save="handleSaveMosaic"
          @cancel="handleCancelEditor"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  background: rgba(3, 8, 16, 0.74);
  backdrop-filter: blur(6px);
}

.modal-card {
  width: min(1100px, calc(100vw - 48px));
  max-height: min(900px, calc(100vh - 48px));
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
  font-size: 26px;
}

.modal-header p {
  margin: 0;
  color: #98afd2;
}

.close-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
  cursor: pointer;
  font-weight: 600;
}

.action-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.action-hint {
  margin: 0;
  color: #9db4d8;
  font-size: 14px;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  min-height: 52px;
  padding: 0 20px;
  border-radius: 14px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  cursor: pointer;
  font-weight: 600;
  font-size: 15px;
}

.direct-btn {
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
}

.mosaic-btn {
  background: linear-gradient(135deg, #6bc3ff, #3f7df7);
  color: #08111f;
}

.preview-panel {
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
}

.preview-panel img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.editor-panel {
  height: min(700px, calc(100vh - 200px));
}

@media (max-width: 768px) {
  .action-buttons {
    flex-direction: column;
  }
}
</style>
