<script setup lang="ts">
import { ref, watch } from "vue";
import type { AppSettings } from "../../../main/types/app.types";

const props = defineProps<{
  open: boolean;
  settings: AppSettings | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  browse: [];
  save: [settings: AppSettings];
}>();

const workspaceDir = ref("");
const llmBaseUrl = ref("");
const doubaoAsrBaseUrl = ref("");
const doubaoAsrResourceId = ref("");
const doubaoUid = ref("");

watch(
  () => props.settings,
  (settings) => {
    workspaceDir.value = settings?.workspaceDir ?? "";
    llmBaseUrl.value = settings?.globalRuntime?.llmBaseUrl ?? "https://api.deepseek.com";
    doubaoAsrBaseUrl.value =
      settings?.globalRuntime?.doubaoAsrBaseUrl ?? "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
    doubaoAsrResourceId.value = settings?.globalRuntime?.doubaoAsrResourceId ?? "volc.bigasr.auc_turbo";
    doubaoUid.value = settings?.globalRuntime?.doubaoUid ?? "video-to-post-user";
  },
  { immediate: true }
);

function handleSave(): void {
  emit("save", {
    workspaceDir: workspaceDir.value.trim(),
    globalRuntime: {
      llmBaseUrl: llmBaseUrl.value.trim(),
      doubaoAsrBaseUrl: doubaoAsrBaseUrl.value.trim(),
      doubaoAsrResourceId: doubaoAsrResourceId.value.trim(),
      doubaoUid: doubaoUid.value.trim()
    }
  });
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Global Settings</span>
          <h3>全局设置</h3>
        </div>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </div>

      <div class="content">
        <label class="field">
          <span>工作目录</span>
          <input v-model="workspaceDir" type="text" placeholder="请选择一个用于存放项目数据的目录" />
          <small>视频、音频、切片、图片、草稿和导出临时文件，都会默认写到该目录。</small>
        </label>

        <label class="field">
          <span>LLM_BASE_URL</span>
          <input v-model="llmBaseUrl" type="text" placeholder="https://api.deepseek.com" />
        </label>

        <label class="field">
          <span>DOUBAO_ASR_BASE_URL</span>
          <input
            v-model="doubaoAsrBaseUrl"
            type="text"
            placeholder="https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
          />
        </label>

        <label class="field">
          <span>DOUBAO_ASR_RESOURCE_ID</span>
          <input v-model="doubaoAsrResourceId" type="text" placeholder="volc.bigasr.auc_turbo" />
        </label>

        <label class="field">
          <span>DOUBAO_UID</span>
          <input v-model="doubaoUid" type="text" placeholder="video-to-post-user" />
        </label>

        <div class="actions">
          <button class="ghost-btn" @click="emit('browse')">选择目录</button>
          <button class="primary-btn" :disabled="saving || !workspaceDir.trim()" @click="handleSave">
            {{ saving ? "保存中..." : "保存设置" }}
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
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(3, 8, 16, 0.74);
  backdrop-filter: blur(6px);
}

.modal-card {
  width: min(720px, calc(100vw - 48px));
  max-height: min(760px, calc(100vh - 48px));
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

.content {
  display: grid;
  gap: 18px;
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

.field small {
  color: #9db4d8;
  line-height: 1.7;
}

.actions {
  display: flex;
  gap: 12px;
}
</style>
