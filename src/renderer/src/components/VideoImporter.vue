<script setup lang="ts">
const props = defineProps<{
  selectedVideoPath: string | null;
  busy: boolean;
  frameOffsetSeconds: number;
}>();

const emit = defineEmits<{
  select: [];
  generate: [];
  updateFrameOffset: [value: number];
}>();
</script>

<template>
  <section class="importer-panel">
    <div class="panel-header">
      <span class="kicker">工具操作</span>
      <h2>视频转图文</h2>
      <p>导入一个本地视频，自动抽音频、识别语音、生成段落并抽取配图。</p>
    </div>

    <div class="video-path">
      <span>已选视频</span>
      <strong>{{ props.selectedVideoPath ?? "还没有选择文件" }}</strong>
    </div>

    <label class="offset-field">
      <span>抽帧偏移秒数</span>
      <input
        :value="props.frameOffsetSeconds"
        type="number"
        min="0"
        step="0.5"
        @input="emit('updateFrameOffset', Number(($event.target as HTMLInputElement).value))"
      />
      <small>生成配图时，将从段落时间范围的 start 往后偏移这么多秒再抽帧。</small>
    </label>

    <div class="actions">
      <button class="ghost-btn" @click="emit('select')">选择视频</button>
      <button class="primary-btn" :disabled="!props.selectedVideoPath || props.busy" @click="emit('generate')">
        {{ props.busy ? "生成中..." : "开始生成" }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.importer-panel {
  padding: 28px;
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(14, 22, 40, 0.96), rgba(11, 17, 31, 0.94));
  border: 1px solid rgba(146, 180, 255, 0.14);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.panel-header h2 {
  margin: 8px 0 10px;
  font-size: 30px;
}

.panel-header p {
  margin: 0;
  color: #9bb2d7;
  line-height: 1.7;
}

.kicker {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #78c0ff;
}

.video-path,
.offset-field {
  margin-top: 22px;
  padding: 18px 18px 20px;
  border-radius: 18px;
  background: rgba(124, 178, 255, 0.08);
  border: 1px solid rgba(124, 178, 255, 0.12);
}

.video-path span,
.offset-field span {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #86a8d5;
}

.video-path strong {
  display: block;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-all;
}

.offset-field input {
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: rgba(255, 255, 255, 0.03);
  color: #edf5ff;
}

.offset-field small {
  display: block;
  margin-top: 10px;
  color: #9db4d8;
  line-height: 1.6;
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.ghost-btn,
.primary-btn {
  flex: 1;
  min-height: 48px;
  border-radius: 14px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.ghost-btn {
  background: rgba(255, 255, 255, 0.03);
  color: #eef5ff;
  border-color: rgba(143, 176, 255, 0.14);
}

.primary-btn {
  background: linear-gradient(135deg, #6bc3ff, #3f7df7);
  color: #06111f;
}

.primary-btn:disabled,
.ghost-btn:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}
</style>
