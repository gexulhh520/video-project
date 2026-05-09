<script setup lang="ts">
const props = defineProps<{
  selectedVideoPath: string | null;
  busy: boolean;
  frameOffsetSeconds: number;
  configReady: boolean;
  missingConfigItems: string[];
}>();

const emit = defineEmits<{
  select: [];
  generate: [];
  updateFrameOffset: [value: number];
  openToolConfig: [];
}>();
</script>

<template>
  <section class="importer-panel">
    <div class="panel-header">
      <div>
        <span class="kicker">工具操作</span>
        <h2>视频转图文</h2>
        <p>导入一个本地视频，自动抽音频、识别语音、生成段落并抽取配图。</p>
      </div>
      <button class="config-link" @click="emit('openToolConfig')">
        配置
        <span v-if="!props.configReady" class="config-badge">未完成</span>
      </button>
    </div>

    <div v-if="!props.configReady" class="config-alert">
      <div>
        <strong>先补全工具配置，才能开始生成</strong>
        <p>当前还缺少：{{ props.missingConfigItems.join("、") }}</p>
      </div>
      <button class="alert-btn" @click="emit('openToolConfig')">去配置</button>
    </div>

    <div class="video-path">
      <span>已选视频</span>
      <strong>{{ props.selectedVideoPath ?? "还没有选择文件" }}</strong>
    </div>

    <label class="offset-field">
      <span>抽帧偏移秒数</span>
      <div class="offset-input-shell">
        <input
          :value="props.frameOffsetSeconds"
          type="number"
          min="0"
          step="0.5"
          @input="emit('updateFrameOffset', Number(($event.target as HTMLInputElement).value))"
        />
      </div>
      <small>生成配图时，会从段落时间范围的 start 往后偏移这么多秒再抽帧。</small>
    </label>

    <div class="actions">
      <button class="ghost-btn" @click="emit('select')">选择视频</button>
      <button class="primary-btn" :disabled="!props.selectedVideoPath || props.busy || !props.configReady" @click="emit('generate')">
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

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
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

.config-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(145, 200, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: #91c8ff;
  font-size: 13px;
  cursor: pointer;
}

.config-badge {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 120, 120, 0.16);
  color: #ffd3d3;
  font-size: 11px;
  font-weight: 700;
}

.config-alert {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 139, 93, 0.18);
  background:
    radial-gradient(circle at top right, rgba(255, 171, 106, 0.12), transparent 35%),
    linear-gradient(180deg, rgba(255, 129, 87, 0.08), rgba(255, 255, 255, 0.02));
}

.config-alert strong {
  display: block;
  color: #fff2e8;
  margin-bottom: 4px;
  font-size: 14px;
}

.config-alert p {
  margin: 0;
  color: #ffc9ae;
  line-height: 1.6;
  font-size: 13px;
}

.alert-btn {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 194, 149, 0.24);
  background: rgba(255, 255, 255, 0.08);
  color: #fff1e5;
  font-weight: 600;
  cursor: pointer;
}

.video-path,
.video-path {
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

.offset-field {
  margin-top: 22px;
  display: grid;
  gap: 10px;
}

.offset-input-shell {
  padding: 10px;
  border-radius: 18px;
  background: rgba(124, 178, 255, 0.08);
  border: 1px solid rgba(124, 178, 255, 0.12);
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
