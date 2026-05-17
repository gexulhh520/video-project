<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  ContentStudioModelRole,
  ContentStudioTabKey,
  ContentStudioTabModelSettings
} from "../../../../main/types/content-studio.types";
import type { OpenCliProvider } from "../../../../main/types/app.types";

const props = defineProps<{
  open: boolean;
  tab: ContentStudioTabKey;
  settings: ContentStudioTabModelSettings | null;
  saving: boolean;
  testingRole: ContentStudioModelRole | null;
  testMessage: string;
}>();

const emit = defineEmits<{
  close: [];
  save: [settings: ContentStudioTabModelSettings];
  test: [role: ContentStudioModelRole, provider: OpenCliProvider, profile: string];
}>();

const PROVIDERS: OpenCliProvider[] = ["chatgpt", "gemini", "claude", "grok", "doubao", "yuanbao"];

const tabLabels: Record<ContentStudioTabKey, string> = {
  topic: "话题成文",
  material: "素材二创",
  hot: "热点成文",
  layout: "图文排版"
};

const form = ref<ContentStudioTabModelSettings | null>(null);

watch(
  () => props.settings,
  (value) => {
    form.value = value ? JSON.parse(JSON.stringify(value)) : null;
  },
  { immediate: true }
);

const tabTitle = computed(() => tabLabels[props.tab]);

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function handleSave(): void {
  if (!form.value) {
    return;
  }

  const next: ContentStudioTabModelSettings = {
    modelA: {
      ...form.value.modelA,
      profile: form.value.modelA.profile.trim(),
      roleName: form.value.modelA.roleName.trim() || "模型 A"
    },
    modelB: {
      ...form.value.modelB,
      profile: form.value.modelB.profile.trim(),
      roleName: form.value.modelB.roleName.trim() || "模型 B"
    },
    debateRounds: normalizePositiveNumber(form.value.debateRounds, 2),
    pollIntervalMs: normalizePositiveNumber(form.value.pollIntervalMs, 3000),
    timeoutMs: normalizePositiveNumber(form.value.timeoutMs, 180000)
  };

  emit("save", next);
}

function handleTest(role: ContentStudioModelRole): void {
  if (!form.value) {
    return;
  }

  const model = role === "modelA" ? form.value.modelA : form.value.modelB;
  emit("test", role, model.provider, model.profile);
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Tab Model Settings</span>
          <h3>{{ tabTitle }}模型配置</h3>
        </div>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </div>

      <div v-if="form" class="content">
        <section class="group">
          <h4>模型 A</h4>
          <label class="field">
            <span>Provider</span>
            <select v-model="form.modelA.provider">
              <option v-for="provider in PROVIDERS" :key="provider" :value="provider">{{ provider }}</option>
            </select>
          </label>
          <label class="field">
            <span>Profile</span>
            <input v-model="form.modelA.profile" type="text" placeholder="请输入 OpenCLI Profile" />
          </label>
          <label class="field">
            <span>角色名称</span>
            <input v-model="form.modelA.roleName" type="text" placeholder="模型 A 角色" />
          </label>
          <label class="switch-field">
            <input v-model="form.modelA.enabled" type="checkbox" />
            <span>启用模型 A</span>
          </label>
          <button class="ghost-btn" :disabled="saving || testingRole === 'modelA'" @click="handleTest('modelA')">
            {{ testingRole === "modelA" ? "测试中..." : "测试模型 A" }}
          </button>
        </section>

        <section class="group">
          <h4>模型 B</h4>
          <label class="field">
            <span>Provider</span>
            <select v-model="form.modelB.provider">
              <option v-for="provider in PROVIDERS" :key="provider" :value="provider">{{ provider }}</option>
            </select>
          </label>
          <label class="field">
            <span>Profile</span>
            <input v-model="form.modelB.profile" type="text" placeholder="请输入 OpenCLI Profile" />
          </label>
          <label class="field">
            <span>角色名称</span>
            <input v-model="form.modelB.roleName" type="text" placeholder="模型 B 角色" />
          </label>
          <label class="switch-field">
            <input v-model="form.modelB.enabled" type="checkbox" />
            <span>启用模型 B</span>
          </label>
          <button class="ghost-btn" :disabled="saving || testingRole === 'modelB'" @click="handleTest('modelB')">
            {{ testingRole === "modelB" ? "测试中..." : "测试模型 B" }}
          </button>
        </section>

        <section class="group">
          <h4>讨论设置</h4>
          <p class="hint">阶段 2 当前为固定四步流程（A策划 → B审稿 → A重写 → B终审），讨论轮数暂不开放编辑。</p>
          <p class="hint">预留轮数字段：{{ form.debateRounds }}</p>
          <label class="field">
            <span>轮询间隔 (ms)</span>
            <input v-model.number="form.pollIntervalMs" type="number" min="1000" step="500" />
          </label>
          <label class="field">
            <span>单轮超时 (ms)</span>
            <input v-model.number="form.timeoutMs" type="number" min="30000" step="1000" />
          </label>
        </section>

        <p v-if="testMessage" class="hint">{{ testMessage }}</p>

        <div class="actions">
          <button class="primary-btn" :disabled="saving" @click="handleSave">{{ saving ? "保存中..." : "保存" }}</button>
        </div>
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
  width: min(980px, calc(100vw - 48px));
  max-height: min(860px, calc(100vh - 48px));
  overflow: auto;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: linear-gradient(180deg, rgba(14, 21, 36, 0.98), rgba(8, 13, 24, 0.98));
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
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

.content {
  display: grid;
  gap: 14px;
}

.group {
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
  display: grid;
  gap: 10px;
}

.group h4 {
  margin: 0;
}

.field {
  display: grid;
  gap: 8px;
}

.field span,
.switch-field span,
.hint {
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
  min-height: 38px;
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

.actions {
  display: flex;
  justify-content: flex-end;
}
</style>
