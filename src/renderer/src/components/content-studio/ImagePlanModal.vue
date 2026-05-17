<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  ContentStudioImagePlanType,
  ContentStudioParagraphImagePlanUpdate,
  ContentStudioTask
} from "../../../../main/types/content-studio.types";

const props = defineProps<{
  open: boolean;
  task: ContentStudioTask | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [updates: ContentStudioParagraphImagePlanUpdate[]];
}>();

type EditableRow = {
  paragraphId: string;
  text: string;
  type: ContentStudioImagePlanType;
  caption: string;
  prompt: string;
};

const rows = ref<EditableRow[]>([]);

watch(
  () => [props.open, props.task?.taskId],
  () => {
    if (!props.open || !props.task?.result) {
      rows.value = [];
      return;
    }
    rows.value = props.task.result.paragraphs.map((paragraph) => ({
      paragraphId: paragraph.paragraphId,
      text: paragraph.text,
      type: paragraph.imagePlan?.type || "none",
      caption: paragraph.imagePlan?.caption || "",
      prompt: paragraph.imagePlan?.prompt || ""
    }));
  },
  { immediate: true }
);

const canSave = computed(() => Boolean(props.task && rows.value.length > 0 && !props.saving));

function save(): void {
  const updates: ContentStudioParagraphImagePlanUpdate[] = rows.value.map((row) => ({
    paragraphId: row.paragraphId,
    imagePlan: row.type === "none"
      ? { type: "none" }
      : {
          type: row.type,
          caption: row.caption.trim() || undefined,
          prompt: row.prompt.trim() || undefined
        }
  }));
  emit("save", updates);
}
</script>

<template>
  <div v-if="props.open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <header class="modal-header">
        <div>
          <h3>配图计划</h3>
          <p>编辑每段的图片类型、说明和提示词。</p>
        </div>
        <button class="ghost-btn" @click="emit('close')">关闭</button>
      </header>
      <div v-if="rows.length" class="list">
        <article v-for="(row, index) in rows" :key="row.paragraphId" class="item">
          <p class="title">段落 {{ index + 1 }}（{{ row.paragraphId }}）</p>
          <p class="text">{{ row.text }}</p>
          <div class="field-grid">
            <label>
              <span>图片类型</span>
              <select v-model="row.type">
                <option value="source_image">source_image</option>
                <option value="ai_generated">ai_generated</option>
                <option value="infographic">infographic</option>
                <option value="none">none</option>
              </select>
            </label>
            <label>
              <span>配图说明 caption</span>
              <input v-model="row.caption" type="text" placeholder="可选" />
            </label>
            <label>
              <span>提示词 prompt</span>
              <textarea v-model="row.prompt" rows="3" placeholder="可选"></textarea>
            </label>
          </div>
        </article>
      </div>
      <p v-else class="hint">当前任务没有可编辑段落。</p>
      <footer class="footer">
        <button class="ghost-btn" @click="emit('close')">取消</button>
        <button class="primary-btn" :disabled="!canSave" @click="save">{{ props.saving ? "保存中..." : "保存配图计划" }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; z-index: 72; display: grid; place-items: center; background: rgba(5,10,20,0.7); }
.modal-card { width: min(980px, calc(100vw - 40px)); max-height: 88vh; overflow: auto; padding: 20px; border-radius: 16px; border: 1px solid rgba(149,181,255,0.16); background: #0e1626; display: grid; gap: 12px; }
.modal-header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.modal-header h3 { margin: 0; }
.modal-header p, .hint { margin: 6px 0 0; color: #9cb3d7; }
.list { display: grid; gap: 12px; }
.item { border: 1px solid rgba(149,181,255,0.14); border-radius: 12px; padding: 12px; display: grid; gap: 10px; }
.title { margin: 0; color: #eaf3ff; font-weight: 700; }
.text { margin: 0; color: #9cb3d7; font-size: 13px; white-space: pre-wrap; }
.field-grid { display: grid; gap: 8px; }
label { display: grid; gap: 6px; }
label span { color: #9cb3d7; font-size: 12px; }
input, textarea, select { border-radius: 8px; border: 1px solid rgba(140,173,247,0.2); background: rgba(255,255,255,0.02); color: #eaf3ff; padding: 8px; }
.footer { display: flex; justify-content: flex-end; gap: 8px; }
.ghost-btn, .primary-btn { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); cursor: pointer; font-weight: 600; }
.ghost-btn { background: rgba(255,255,255,0.03); color: #eaf3ff; }
.primary-btn { background: linear-gradient(135deg, #79f0d5, #47b9ff); color: #08111f; }
</style>
