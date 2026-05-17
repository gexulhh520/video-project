<script setup lang="ts">
import { ref, watch } from "vue";
import type { ContentStudioSettings } from "../../../../main/types/content-studio.types";
import type { OpenCliProvider, OpenCliRuntimeHealthStatus } from "../../../../main/types/app.types";
import { desktopApi } from "../../api/desktop-api";

const props = defineProps<{
  open: boolean;
  settings: ContentStudioSettings | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [settings: ContentStudioSettings];
}>();

const PROVIDERS: OpenCliProvider[] = ["chatgpt", "gemini", "claude", "grok", "doubao", "yuanbao"];
const DEFAULT_OPENCLI_COMMAND = "opencli";

const form = ref<ContentStudioSettings | null>(null);
const openCliHealth = ref<OpenCliRuntimeHealthStatus | null>(null);
const openCliChecking = ref(false);
const openCliRepairing = ref(false);
const openCliStatusMessage = ref("");

watch(
  () => props.settings,
  (value) => {
    form.value = value ? JSON.parse(JSON.stringify(value)) : null;
  },
  { immediate: true }
);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }
    void handleCheckOpenCliHealth();
  }
);

function handleSave(): void {
  if (!form.value) {
    return;
  }

  emit("save", {
    ...form.value,
    openCliCommand: DEFAULT_OPENCLI_COMMAND,
    image: {
      ...form.value.image,
      profile: form.value.image.profile.trim(),
      outputDir: form.value.image.outputDir?.trim() || undefined
    }
  });
}

async function handleCheckOpenCliHealth(): Promise<void> {
  if (!form.value) {
    return;
  }

  openCliChecking.value = true;
  openCliStatusMessage.value = "";

  try {
    openCliHealth.value = await desktopApi.checkContentStudioOpenCliHealth(DEFAULT_OPENCLI_COMMAND);
    openCliStatusMessage.value = openCliHealth.value.message;
  } catch (error) {
    openCliHealth.value = null;
    openCliStatusMessage.value = error instanceof Error ? error.message : "OpenCLI 检测失败";
  } finally {
    openCliChecking.value = false;
  }
}

async function handleRepairOpenCliRuntime(): Promise<void> {
  if (!form.value) {
    return;
  }

  openCliRepairing.value = true;
  openCliStatusMessage.value = "";

  try {
    openCliHealth.value = await desktopApi.repairContentStudioOpenCliRuntime(DEFAULT_OPENCLI_COMMAND);
    openCliStatusMessage.value = openCliHealth.value.message;
  } catch (error) {
    openCliHealth.value = null;
    openCliStatusMessage.value = error instanceof Error ? error.message : "OpenCLI 修复失败";
  } finally {
    openCliRepairing.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Content Studio Config</span>
          <h3>内容创作工作台全局配置</h3>
        </div>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </div>

      <div v-if="form" class="content">
        <section class="group runtime-card">
          <h4>运行状态</h4>
          <strong class="runtime-status">{{ openCliHealth?.healthy ? "正常" : "待检测 / 异常" }}</strong>
          <span class="hint">Profile：{{ openCliHealth?.selectedProfile || "未检测到" }}</span>
          <div class="runtime-actions">
            <button
              class="ghost-btn"
              :disabled="saving || openCliChecking || openCliRepairing"
              @click="handleCheckOpenCliHealth"
            >
              {{ openCliChecking ? "检测中..." : "开始检测" }}
            </button>
            <button
              class="ghost-btn"
              :disabled="saving || openCliChecking || openCliRepairing"
              @click="handleRepairOpenCliRuntime"
            >
              {{ openCliRepairing ? "修复中..." : "一键修复" }}
            </button>
          </div>
          <p v-if="openCliStatusMessage" class="hint">{{ openCliStatusMessage }}</p>
        </section>

        <section class="group">
          <h4>配图设置</h4>
          <label class="switch-field">
            <input v-model="form.image.enabled" type="checkbox" />
            <span>启用 AI 配图能力</span>
          </label>

          <label class="field">
            <span>图片模型 Provider</span>
            <select v-model="form.image.provider">
              <option v-for="provider in PROVIDERS" :key="provider" :value="provider">{{ provider }}</option>
            </select>
          </label>

          <label class="field">
            <span>图片模型 Profile</span>
            <input v-model="form.image.profile" type="text" placeholder="请输入图片模型 Profile" />
          </label>

          <label class="field">
            <span>浏览器默认下载目录</span>
            <input v-model="form.image.outputDir" type="text" placeholder="例如：D:\\Downloads 或 content-studio/downloads" />
          </label>
          <p class="hint">chatgpt 浏览器生图将先下载到这个目录，再自动复制到任务 images 目录。</p>
        </section>

        <p class="hint">配置保存在 `config/content-studio.json`，每个选项卡模型配置在工作台内单独维护。</p>

        <div class="actions">
          <button class="primary-btn" :disabled="saving" @click="handleSave">{{ saving ? "保存中..." : "保存配置" }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 68;
  display: grid;
  place-items: center;
  background: rgba(3, 8, 16, 0.74);
  backdrop-filter: blur(6px);
}

.modal-card {
  width: min(740px, calc(100vw - 48px));
  max-height: min(820px, calc(100vh - 48px));
  overflow: auto;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: linear-gradient(180deg, rgba(14, 21, 36, 0.98), rgba(8, 13, 24, 0.98));
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #79c8ff;
}

.modal-header h3 {
  margin: 8px 0 0;
  font-size: 26px;
}

.content,
.group {
  display: grid;
  gap: 12px;
}

.group {
  margin-top: 6px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
}

.group h4 {
  margin: 0;
}

.field {
  display: grid;
  gap: 8px;
}

.field span,
.hint,
.switch-field span {
  color: #9db4d8;
  font-size: 12px;
}

.field input,
.field select {
  min-height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: rgba(255, 255, 255, 0.03);
  color: #edf5ff;
}

.switch-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.close-btn,
.ghost-btn,
.primary-btn {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
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

.runtime-card {
  margin-top: 0;
}

.runtime-status {
  font-size: 18px;
  color: #eaf4ff;
}

.runtime-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.actions {
  display: flex;
  justify-content: flex-end;
}
</style>
