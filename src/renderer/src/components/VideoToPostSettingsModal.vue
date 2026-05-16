<script setup lang="ts">
import { ref, watch } from "vue";
import type { VideoToPostSettings } from "../../../main/types/app.types";

const props = defineProps<{
  open: boolean;
  settings: VideoToPostSettings | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [settings: VideoToPostSettings];
}>();

const form = ref<VideoToPostSettings>({
  doubaoAsrApiKey: "",
  llmApiKey: "",
  llmModel: "deepseek-v4-flash",
  runtime: "opencli",
  openCliCommand: "opencli",
  openCliProfile: "",
  openCliProvider: "chatgpt",
  openCliPollIntervalMs: 3000,
  openCliTimeoutMs: 180000
});

watch(
  () => props.settings,
  (settings) => {
    form.value = {
      doubaoAsrApiKey: settings?.doubaoAsrApiKey ?? "",
      llmApiKey: settings?.llmApiKey ?? "",
      llmModel: settings?.llmModel ?? "deepseek-v4-flash",
      runtime: settings?.runtime ?? "opencli",
      openCliCommand: settings?.openCliCommand ?? "opencli",
      openCliProfile: settings?.openCliProfile ?? "",
      openCliProvider: settings?.openCliProvider ?? "chatgpt",
      openCliPollIntervalMs: settings?.openCliPollIntervalMs ?? 3000,
      openCliTimeoutMs: settings?.openCliTimeoutMs ?? 180000
    };
  },
  { immediate: true }
);

function handleSave(): void {
  emit("save", {
    doubaoAsrApiKey: form.value.doubaoAsrApiKey.trim(),
    llmApiKey: form.value.llmApiKey.trim(),
    llmModel: form.value.llmModel.trim() || "deepseek-v4-flash",
    runtime: form.value.runtime ?? "opencli",
    openCliCommand: form.value.openCliCommand?.trim() || "opencli",
    openCliProfile: form.value.openCliProfile?.trim() || "",
    openCliProvider: form.value.openCliProvider ?? "chatgpt",
    openCliPollIntervalMs: Number(form.value.openCliPollIntervalMs || 3000),
    openCliTimeoutMs: Number(form.value.openCliTimeoutMs || 180000)
  });
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Video To Post Config</span>
          <h3>视频转图文私有配置</h3>
        </div>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </div>

      <div class="content">
        <label class="field">
          <span>豆包 ASR Key</span>
          <input v-model="form.doubaoAsrApiKey" type="password" placeholder="填写 DOUBAO_ASR_API_KEY" />
        </label>

        <label class="field">
          <span>LLM 运行模式</span>
          <select v-model="form.runtime">
            <option value="opencli">opencli（推荐）</option>
            <option value="bb-browser">api-key</option>
          </select>
        </label>

        <template v-if="form.runtime === 'opencli'">
          <label class="field">
            <span>OpenCLI 命令</span>
            <input v-model="form.openCliCommand" type="text" placeholder="opencli" />
          </label>
          <label class="field">
            <span>OpenCLI Profile（可留空自动检测）</span>
            <input v-model="form.openCliProfile" type="text" placeholder="例如 8qatyy5j" />
          </label>
          <label class="field">
            <span>OpenCLI Provider</span>
            <select v-model="form.openCliProvider">
              <option value="chatgpt">chatgpt</option>
              <option value="gemini">gemini</option>
              <option value="claude">claude</option>
              <option value="grok">grok</option>
              <option value="doubao">doubao</option>
              <option value="yuanbao">yuanbao</option>
            </select>
          </label>
        </template>

        <template v-else>
          <label class="field">
            <span>DeepSeek LLM Key</span>
            <input v-model="form.llmApiKey" type="password" placeholder="填写 LLM_API_KEY" />
          </label>

          <label class="field">
            <span>LLM 模型</span>
            <input v-model="form.llmModel" type="text" placeholder="deepseek-v4-flash" />
            <small>默认模型是 `deepseek-v4-flash`，也可替换为兼容模型名。</small>
          </label>
        </template>

        <p class="hint">
          这些配置会保存到当前空间目录下的 `config/video-to-post.json`，属于“视频转图文”工具自己的私有配置。
        </p>

        <div class="actions">
          <button class="primary-btn" :disabled="saving" @click="handleSave">
            {{ saving ? "保存中..." : "保存配置" }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 65;
  display: grid;
  place-items: center;
  background: rgba(3, 8, 16, 0.74);
  backdrop-filter: blur(6px);
}

.modal-card {
  width: min(760px, calc(100vw - 48px));
  max-height: min(820px, calc(100vh - 48px));
  padding: 22px;
  overflow: auto;
  border-radius: 28px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: linear-gradient(180deg, rgba(14, 21, 36, 0.98), rgba(8, 13, 24, 0.98));
  box-shadow: 0 36px 80px rgba(0, 0, 0, 0.42);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #79c8ff;
}

.modal-header h3 {
  margin: 8px 0 0;
  font-size: 28px;
  color: #edf5ff;
}

.content {
  display: grid;
  gap: 16px;
}

.field {
  display: grid;
  gap: 10px;
}

.field span {
  color: #9db4d8;
  font-size: 12px;
}

.field input,
.field select {
  width: 100%;
  min-height: 46px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: rgba(255, 255, 255, 0.03);
  color: #edf5ff;
}

.field small,
.hint {
  color: #9db4d8;
  line-height: 1.7;
}

.close-btn,
.primary-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  cursor: pointer;
  font-weight: 600;
}

.close-btn {
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

.actions {
  display: flex;
  justify-content: flex-end;
}
</style>
