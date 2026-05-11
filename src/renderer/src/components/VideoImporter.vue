<script setup lang="ts">
const props = defineProps<{
  selectedVideoPath: string | null;
  busy: boolean;
  frameOffsetSeconds: number;
  userPrompt: string;
  configReady: boolean;
  missingConfigItems: string[];
}>();

const emit = defineEmits<{
  select: [];
  generate: [];
  updateFrameOffset: [value: number];
  updateUserPrompt: [value: string];
  openToolConfig: [];
}>();

const promptExamples = [
  {
    label: "微头条",
    value:
      "请改成适合微头条发布的风格，开头要更有冲突感，语言更口语化，每段不要太长，整体控制在 600 字以内，不要像新闻稿。"
  },
  {
    label: "公众号文章",
    value:
      "请改成适合公众号文章发布的风格，逻辑更完整，段落衔接更自然，开头要有吸引力，中间要有分析，结尾要有总结。"
  },
  {
    label: "小红书",
    value:
      "请改成适合小红书图文笔记的风格，表达更有分享感和情绪感，语言自然一点，不要太官方，适合配图阅读。"
  },
  {
    label: "深度分析",
    value:
      "请把内容改成偏深度分析的风格，减少口水话，增强观点判断、逻辑递进和信息密度，适合对行业趋势感兴趣的人阅读。"
  },
  {
    label: "短内容",
    value:
      "请把整篇压缩成短内容，保留最有冲突和信息量的部分，语言直接一点，整体不超过 400 字。"
  }
];

function applyPromptExample(value: string): void {
  emit("updateUserPrompt", value);
}
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

    <label class="prompt-field">
      <span>生成个性化要求</span>
      <textarea
        :value="props.userPrompt"
        rows="6"
        placeholder="示例：请改成适合微头条发布的风格，开头要更有冲突感，语言更口语化，每段不要太长，整体控制在 600 字以内，不要像新闻稿。"
        @input="emit('updateUserPrompt', ($event.target as HTMLTextAreaElement).value)"
      />
      <small>可填写发布平台、语气、字数、风格、结构要求。不填写则按默认图文风格生成。</small>

      <div class="prompt-examples">
        <p>参考示例：</p>
        <div class="example-buttons">
          <button
            v-for="item in promptExamples"
            :key="item.label"
            type="button"
            class="example-btn"
            @click="applyPromptExample(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
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

.prompt-field {
  margin-top: 22px;
  display: grid;
  gap: 10px;
}

.prompt-field span {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #86a8d5;
}

.prompt-field textarea {
  width: 100%;
  min-height: 132px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: rgba(124, 178, 255, 0.08);
  color: #edf5ff;
  outline: none;
  resize: vertical;
  line-height: 1.7;
}

.prompt-field textarea::placeholder {
  color: rgba(157, 180, 216, 0.72);
}

.prompt-field small {
  display: block;
  color: #9db4d8;
  line-height: 1.6;
}

.prompt-examples {
  margin-top: 4px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.025);
}

.prompt-examples p {
  margin: 0 0 10px;
  color: #9db4d8;
  font-size: 12px;
}

.example-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.example-btn {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(145, 200, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: #91c8ff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.example-btn:hover {
  background: rgba(91, 163, 255, 0.16);
  border-color: rgba(145, 200, 255, 0.32);
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
