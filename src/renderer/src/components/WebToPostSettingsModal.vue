<script setup lang="ts">
import { ref, watch } from "vue";
import type { WebToPostSettings } from "../../../main/types/app.types";

const props = defineProps<{
  open: boolean;
  settings: WebToPostSettings | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [settings: WebToPostSettings];
}>();

const form = ref<WebToPostSettings>({
  llmApiKey: "",
  llmModel: "deepseek-v4-flash",
  bbBrowserCommand: "npx",
  bbBrowserArgs: "-y -p bb-browser bb-browser",
  bbBrowserMcpCommand: "npx",
  bbBrowserMcpArgs: "-y -p bb-browser bb-browser-mcp"
});

watch(
  () => props.settings,
  (settings) => {
    form.value = {
      llmApiKey: settings?.llmApiKey ?? "",
      llmModel: settings?.llmModel ?? "deepseek-v4-flash",
      bbBrowserCommand: settings?.bbBrowserCommand ?? "npx",
      bbBrowserArgs: settings?.bbBrowserArgs ?? "-y -p bb-browser bb-browser",
      bbBrowserMcpCommand: settings?.bbBrowserMcpCommand ?? "npx",
      bbBrowserMcpArgs: settings?.bbBrowserMcpArgs ?? "-y -p bb-browser bb-browser-mcp"
    };
  },
  { immediate: true }
);

function handleSave(): void {
  emit("save", {
    llmApiKey: form.value.llmApiKey.trim(),
    llmModel: form.value.llmModel.trim() || "deepseek-v4-flash",
    bbBrowserCommand: form.value.bbBrowserCommand.trim() || "npx",
    bbBrowserArgs: form.value.bbBrowserArgs.trim() || "-y -p bb-browser bb-browser",
    bbBrowserMcpCommand: form.value.bbBrowserMcpCommand.trim() || "npx",
    bbBrowserMcpArgs: form.value.bbBrowserMcpArgs.trim() || "-y -p bb-browser bb-browser-mcp"
  });
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Web To Post Config</span>
          <h3>网页转文章原创配置</h3>
        </div>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </div>

      <div class="content">
        <label class="field">
          <span>bb-browser 启动命令</span>
          <input v-model="form.bbBrowserCommand" type="text" placeholder="例如 npx" />
        </label>

        <label class="field">
          <span>bb-browser 启动参数</span>
          <input v-model="form.bbBrowserArgs" type="text" placeholder="-y -p bb-browser bb-browser" />
          <small>默认通过 `npx -y -p bb-browser bb-browser ...` 执行健康检测、reset 和抓取命令，不再假设系统全局安装了 bb-browser。</small>
        </label>

        <label class="field">
          <span>bb-browser MCP 命令</span>
          <input v-model="form.bbBrowserMcpCommand" type="text" placeholder="例如 npx" />
        </label>

        <label class="field">
          <span>bb-browser MCP 参数</span>
          <input v-model="form.bbBrowserMcpArgs" type="text" placeholder="-y -p bb-browser bb-browser-mcp" />
          <small>这组配置先保留备用。当前网页抓取链路已经回退到稳定的 bb-browser CLI 调用，健康检测、打开页面、抓标题、快照和抓图都走 CLI。</small>
        </label>

        <label class="field">
          <span>LLM Key</span>
          <input v-model="form.llmApiKey" type="password" placeholder="填写 LLM_API_KEY" />
        </label>

        <label class="field">
          <span>LLM 模型</span>
          <input v-model="form.llmModel" type="text" placeholder="deepseek-v4-flash" />
        </label>

        <p class="hint">这些配置会保存到当前工作空间下的 `config/web-to-post.json`。</p>

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

.field input {
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
