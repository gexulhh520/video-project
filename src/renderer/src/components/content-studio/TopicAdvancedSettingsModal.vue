<script setup lang="ts">
import { ref, watch } from "vue";

type TopicAdvancedSettings = {
  reviewRounds: number;
  targetReader: string;
  writingStyle: string;
  wordRange: string;
  generateTitleCandidates: boolean;
  generateCoverText: boolean;
  generateImagePlan: boolean;
};

const props = defineProps<{
  open: boolean;
  settings: TopicAdvancedSettings;
}>();

const emit = defineEmits<{
  close: [];
  save: [settings: TopicAdvancedSettings];
}>();

const form = ref<TopicAdvancedSettings>({
  reviewRounds: 2,
  targetReader: "",
  writingStyle: "",
  wordRange: "",
  generateTitleCandidates: true,
  generateCoverText: true,
  generateImagePlan: true
});

watch(
  () => props.settings,
  (value) => {
    form.value = JSON.parse(JSON.stringify(value)) as TopicAdvancedSettings;
  },
  { immediate: true }
);

function normalizeReviewRounds(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return 2;
  }
  return Math.min(5, Math.max(1, Math.floor(value)));
}

function handleSave(): void {
  emit("save", {
    reviewRounds: normalizeReviewRounds(form.value.reviewRounds),
    targetReader: form.value.targetReader.trim(),
    writingStyle: form.value.writingStyle.trim(),
    wordRange: form.value.wordRange.trim(),
    generateTitleCandidates: form.value.generateTitleCandidates,
    generateCoverText: form.value.generateCoverText,
    generateImagePlan: form.value.generateImagePlan
  });
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <header class="modal-header">
        <h3>话题成文高级设置</h3>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </header>

      <div class="form-grid">
        <label class="field">
          <span>审稿轮次</span>
          <input v-model.number="form.reviewRounds" type="number" min="1" max="5" step="1" />
          <small class="hint">
            审稿轮次表示模型 B 审查次数；每增加 1 次审稿，系统会增加一次 A 重写与 B 再审稿。默认 2，范围 1-5。
          </small>
        </label>

        <label class="field">
          <span>目标读者</span>
          <input v-model="form.targetReader" type="text" placeholder="例如：创业公司运营负责人" />
        </label>

        <label class="field">
          <span>文章风格</span>
          <input v-model="form.writingStyle" type="text" placeholder="例如：冷静分析、结论先行" />
        </label>

        <label class="field">
          <span>字数范围</span>
          <input v-model="form.wordRange" type="text" placeholder="例如：1200-1800字" />
        </label>

        <label class="switch-field">
          <input v-model="form.generateTitleCandidates" type="checkbox" />
          <span>生成标题候选</span>
        </label>
        <label class="switch-field">
          <input v-model="form.generateCoverText" type="checkbox" />
          <span>生成封面文案</span>
        </label>
        <label class="switch-field">
          <input v-model="form.generateImagePlan" type="checkbox" />
          <span>生成配图计划</span>
        </label>
      </div>

      <div class="actions">
        <button class="primary-btn" @click="handleSave">保存设置</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 71;
  display: grid;
  place-items: center;
  background: rgba(5, 10, 20, 0.72);
}

.modal-card {
  width: min(760px, calc(100vw - 48px));
  max-height: min(820px, calc(100vh - 48px));
  overflow: auto;
  padding: 22px;
  border-radius: 18px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: #0e1626;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.modal-header h3 {
  margin: 0;
}

.form-grid {
  display: grid;
  gap: 12px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span,
.switch-field span {
  font-size: 12px;
  color: #9db4d8;
}

.field input {
  min-height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: rgba(255, 255, 255, 0.03);
  color: #edf5ff;
}

.hint {
  color: #9cb3d7;
  font-size: 12px;
  line-height: 1.4;
}

.switch-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.close-btn,
.primary-btn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  cursor: pointer;
  font-weight: 600;
}

.close-btn {
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
}

.primary-btn {
  background: linear-gradient(135deg, #79f0d5, #47b9ff);
  color: #08111f;
}

.actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
