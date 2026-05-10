<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

const props = defineProps<{
  sourceImageDataUrl: string;
  sourceImagePath: string;
}>();

const emit = defineEmits<{
  save: [imageBase64: string];
  cancel: [];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);

const brushSize = ref(44);
const mosaicSize = ref(14);

let ctx: CanvasRenderingContext2D | null = null;
let originalImage: HTMLImageElement | null = null;
let mosaicCanvas: HTMLCanvasElement | null = null;

let isDrawing = false;
let lastPoint: { x: number; y: number } | null = null;

const undoStack: ImageData[] = [];
const maxUndoCount = 10;

function loadImage() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();

  img.onload = () => {
    originalImage = img;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);

    mosaicCanvas = createMosaicCanvas(
      img,
      canvas.width,
      canvas.height,
      mosaicSize.value
    );
  };

  img.src = props.sourceImageDataUrl;
}

function createMosaicCanvas(
  img: HTMLImageElement,
  width: number,
  height: number,
  blockSize: number
) {
  const smallCanvas = document.createElement("canvas");
  const smallCtx = smallCanvas.getContext("2d")!;

  smallCanvas.width = Math.ceil(width / blockSize);
  smallCanvas.height = Math.ceil(height / blockSize);

  smallCtx.drawImage(img, 0, 0, smallCanvas.width, smallCanvas.height);

  const resultCanvas = document.createElement("canvas");
  const resultCtx = resultCanvas.getContext("2d")!;

  resultCanvas.width = width;
  resultCanvas.height = height;

  resultCtx.imageSmoothingEnabled = false;

  resultCtx.drawImage(
    smallCanvas,
    0,
    0,
    smallCanvas.width,
    smallCanvas.height,
    0,
    0,
    width,
    height
  );

  return resultCanvas;
}

function getCanvasPoint(e: PointerEvent) {
  const canvas = canvasRef.value!;
  const rect = canvas.getBoundingClientRect();

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function pushUndoSnapshot() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;

  const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  undoStack.push(snapshot);

  if (undoStack.length > maxUndoCount) {
    undoStack.shift();
  }
}

function drawMosaicAt(x: number, y: number) {
  if (!ctx || !mosaicCanvas) return;

  ctx.save();

  ctx.beginPath();
  ctx.arc(x, y, brushSize.value / 2, 0, Math.PI * 2);
  ctx.clip();

  ctx.drawImage(mosaicCanvas, 0, 0);

  ctx.restore();
}

function drawMosaicLine(
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  const step = Math.max(2, brushSize.value / 4);
  const count = Math.ceil(distance / step);

  for (let i = 0; i <= count; i++) {
    const t = count === 0 ? 0 : i / count;

    drawMosaicAt(
      from.x + dx * t,
      from.y + dy * t
    );
  }
}

function handlePointerDown(e: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  canvas.setPointerCapture(e.pointerId);

  isDrawing = true;
  pushUndoSnapshot();

  const point = getCanvasPoint(e);
  lastPoint = point;

  drawMosaicAt(point.x, point.y);
}

function handlePointerMove(e: PointerEvent) {
  if (!isDrawing) return;

  const point = getCanvasPoint(e);

  if (lastPoint) {
    drawMosaicLine(lastPoint, point);
  } else {
    drawMosaicAt(point.x, point.y);
  }

  lastPoint = point;
}

function handlePointerUp(e: PointerEvent) {
  const canvas = canvasRef.value;

  if (canvas && canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }

  isDrawing = false;
  lastPoint = null;
}

function handleUndo() {
  if (!ctx || undoStack.length === 0) return;

  const last = undoStack.pop();

  if (last) {
    ctx.putImageData(last, 0, 0);
  }
}

function handleReset() {
  const canvas = canvasRef.value;

  if (!canvas || !ctx || !originalImage) return;

  pushUndoSnapshot();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
}

function handleSave() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const imageBase64 = canvas.toDataURL("image/png");
  emit("save", imageBase64);
}

function handleCancel() {
  emit("cancel");
}

watch(mosaicSize, () => {
  const canvas = canvasRef.value;

  if (!canvas || !originalImage) return;

  mosaicCanvas = createMosaicCanvas(
    originalImage,
    canvas.width,
    canvas.height,
    mosaicSize.value
  );
});

watch(
  () => props.sourceImageDataUrl,
  () => {
    loadImage();
  }
);

onMounted(async () => {
  await nextTick();
  loadImage();
});
</script>

<template>
  <div class="mosaic-editor">
    <div class="toolbar">
      <div class="tool-group">
        <label>画笔大小</label>
        <input
          v-model.number="brushSize"
          type="range"
          min="10"
          max="140"
          step="1"
          class="slider"
        />
        <span class="value">{{ brushSize }}</span>
      </div>

      <div class="tool-group">
        <label>马赛克强度</label>
        <input
          v-model.number="mosaicSize"
          type="range"
          min="4"
          max="64"
          step="2"
          class="slider"
        />
        <span class="value">{{ mosaicSize }}</span>
      </div>

      <div class="tool-actions">
        <button class="tool-btn" :disabled="undoStack.length === 0" @click="handleUndo">
          撤销
        </button>
        <button class="tool-btn" @click="handleReset">
          重置
        </button>
        <button class="tool-btn cancel-btn" @click="handleCancel">
          取消
        </button>
        <button class="tool-btn save-btn" @click="handleSave">
          保存并替换
        </button>
      </div>
    </div>

    <div class="canvas-container">
      <canvas
        ref="canvasRef"
        class="editor-canvas"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointerleave="handlePointerUp"
      ></canvas>
    </div>
  </div>
</template>

<style scoped>
.mosaic-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  height: 100%;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  padding: 14px 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(149, 181, 255, 0.12);
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tool-group label {
  font-size: 13px;
  color: #9db4d8;
  white-space: nowrap;
}

.slider {
  width: 120px;
  cursor: pointer;
}

.value {
  font-size: 13px;
  color: #eef5ff;
  min-width: 30px;
}

.tool-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.tool-btn {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.save-btn {
  background: linear-gradient(135deg, #6bc3ff, #3f7df7);
  color: #08111f;
}

.cancel-btn {
  background: rgba(255, 100, 100, 0.15);
  border-color: rgba(255, 100, 100, 0.3);
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: auto;
  border-radius: 18px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(0, 0, 0, 0.3);
  min-height: 300px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.editor-canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  cursor: crosshair;
  user-select: none;
}

@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .tool-actions {
    margin-left: 0;
    justify-content: center;
  }
}
</style>
