<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { PostDraft } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";

const props = defineProps<{
  draft: PostDraft | null;
  saving: boolean;
  replacingImageBlockId: string | null;
}>();

const emit = defineEmits<{
  change: [draft: PostDraft];
  save: [];
  replaceImage: [blockId: string];
  openFramePicker: [blockId: string];
}>();

const editableDraft = ref<PostDraft | null>(null);
const imageUrls = ref<Record<string, string>>({});
const rewritingSectionId = ref<string | null>(null);
const rewriteError = ref<{
  sectionId: string;
  message: string;
} | null>(null);

watch(
  () => props.draft,
  (draft) => {
    editableDraft.value = draft ? JSON.parse(JSON.stringify(draft)) : null;
    rewritingSectionId.value = null;
    rewriteError.value = null;
  },
  { immediate: true }
);

watch(
  () => editableDraft.value?.contentBlocks,
  async (contentBlocks) => {
    if (!contentBlocks) {
      imageUrls.value = {};
      return;
    }

    const nextEntries = await Promise.all(
      contentBlocks
        .filter((block): block is Extract<PostDraft["contentBlocks"][number], { type: "image" }> => block.type === "image")
        .map(async (block) => [block.blockId, await desktopApi.readImageAsDataUrl(block.imagePath)] as const)
    );

    imageUrls.value = Object.fromEntries(nextEntries);
  },
  { immediate: true }
);

const imageBlocksBySection = computed(() => {
  if (!editableDraft.value) {
    return {} as Record<string, Extract<PostDraft["contentBlocks"][number], { type: "image" }>>;
  }

  return Object.fromEntries(
    editableDraft.value.contentBlocks
      .filter((block): block is Extract<PostDraft["contentBlocks"][number], { type: "image" }> => block.type === "image")
      .map((block) => [block.sectionId, block])
  );
});

function updateTitle(value: string): void {
  if (!editableDraft.value) {
    return;
  }

  editableDraft.value.title = value;
  emit("change", JSON.parse(JSON.stringify(editableDraft.value)) as PostDraft);
}

function updateSectionParagraph(sectionId: string, value: string): void {
  if (!editableDraft.value) {
    return;
  }

  const section = editableDraft.value.sections.find((item) => item.sectionId === sectionId);
  if (!section) {
    return;
  }

  section.paragraph = value;
  const paragraphBlock = editableDraft.value.contentBlocks.find(
    (block): block is Extract<PostDraft["contentBlocks"][number], { type: "paragraph" }> =>
      block.type === "paragraph" && block.sectionId === sectionId
  );

  if (paragraphBlock) {
    paragraphBlock.text = value;
    paragraphBlock.edited = true;
  }

  editableDraft.value.fullText = editableDraft.value.sections.map((item) => item.paragraph).join("\n\n");
  emit("change", JSON.parse(JSON.stringify(editableDraft.value)) as PostDraft);
}

async function rewriteSectionParagraph(sectionId: string): Promise<void> {
  if (!editableDraft.value || rewritingSectionId.value) {
    return;
  }

  const section = editableDraft.value.sections.find((item) => item.sectionId === sectionId);
  if (!section || !section.paragraph.trim()) {
    return;
  }

  rewritingSectionId.value = sectionId;
  rewriteError.value = null;

  try {
    const rewrittenParagraph = await desktopApi.rewriteParagraph({
      paragraph: section.paragraph
    });
    updateSectionParagraph(sectionId, rewrittenParagraph);
  } catch (error) {
    rewriteError.value = {
      sectionId,
      message: error instanceof Error ? error.message : "洗稿失败"
    };
  } finally {
    rewritingSectionId.value = null;
  }
}
</script>

<template>
  <section class="editor-shell">
    <div v-if="!editableDraft" class="empty-state">
      <span class="eyebrow">Edit Mode</span>
      <h3>先打开一个草稿</h3>
      <p>生成一份图文，或者从草稿箱中打开历史记录后，这里就可以修改标题、段落和图片。</p>
    </div>

    <div v-else class="editor-content">
      <div class="editor-header">
        <div>
          <span class="eyebrow">Edit Mode</span>
          <h3>编辑草稿</h3>
        </div>
        <button class="save-btn" :disabled="saving" @click="emit('save')">
          {{ saving ? "保存中..." : "保存草稿" }}
        </button>
      </div>

      <label class="field">
        <span>标题</span>
        <input :value="editableDraft.title" type="text" @input="updateTitle(($event.target as HTMLInputElement).value)" />
      </label>

      <div class="section-list">
        <article v-for="section in editableDraft.sections" :key="section.sectionId" class="section-card">
          <div class="section-header">
            <strong>{{ section.sectionId }}</strong>
            <span>
              {{ section.sourceTimeRanges[0]?.start?.toFixed?.(1) ?? "0.0" }}s -
              {{ section.sourceTimeRanges[0]?.end?.toFixed?.(1) ?? "0.0" }}s
            </span>
          </div>

          <label class="field">
            <span>段落正文</span>
            <textarea
              :value="section.paragraph"
              rows="7"
              @input="updateSectionParagraph(section.sectionId, ($event.target as HTMLTextAreaElement).value)"
            />
          </label>

          <div class="section-tools">
            <button
              class="action-btn"
              :disabled="Boolean(rewritingSectionId) || !section.paragraph.trim()"
              @click="rewriteSectionParagraph(section.sectionId)"
            >
              {{ rewritingSectionId === section.sectionId ? "洗稿中..." : "LLM 洗稿重写" }}
            </button>
            <span class="tool-hint">把当前段落发给 LLM，重新生成一个新的表达版本。</span>
          </div>

          <p v-if="rewriteError?.sectionId === section.sectionId" class="inline-error">{{ rewriteError.message }}</p>

          <div class="current-image">
            <span class="image-label">当前图片</span>
            <img
              v-if="imageUrls[imageBlocksBySection[section.sectionId]?.blockId]"
              :src="imageUrls[imageBlocksBySection[section.sectionId]?.blockId]"
              :alt="`${section.sectionId} 当前图片`"
            />
            <div v-else class="image-placeholder">图片加载中...</div>
          </div>

          <div class="image-actions">
            <button
              class="action-btn"
              :disabled="replacingImageBlockId === imageBlocksBySection[section.sectionId]?.blockId"
              @click="emit('replaceImage', imageBlocksBySection[section.sectionId]?.blockId)"
            >
              {{ replacingImageBlockId === imageBlocksBySection[section.sectionId]?.blockId ? "替换中..." : "上传替换图片" }}
            </button>
            <button class="ghost-btn" @click="emit('openFramePicker', imageBlocksBySection[section.sectionId]?.blockId)">
              视频选帧替换
            </button>
          </div>

          <p class="hint">
            当前图片来源：{{ imageBlocksBySection[section.sectionId]?.sourceType ?? "auto" }}。
            你可以从当前段落的时间范围附近重新挑一帧来替换图片。
          </p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.editor-shell {
  height: 100%;
  padding: 24px;
  overflow: auto;
  border-radius: 32px;
  background: linear-gradient(180deg, rgba(13, 21, 36, 0.98), rgba(8, 13, 24, 0.98));
  border: 1px solid rgba(154, 186, 255, 0.12);
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.editor-content {
  display: grid;
  gap: 18px;
}

.editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #79c8ff;
}

h3 {
  margin: 10px 0 0;
  font-size: 28px;
}

.save-btn,
.action-btn,
.ghost-btn {
  min-height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  cursor: pointer;
  font-weight: 600;
}

.save-btn,
.action-btn {
  background: linear-gradient(135deg, #6bc3ff, #3f7df7);
  color: #08111f;
}

.ghost-btn {
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
}

.save-btn:disabled,
.action-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.field {
  display: grid;
  gap: 10px;
}

.field span,
.section-header span {
  color: #9db4d8;
  font-size: 12px;
}

input,
textarea {
  width: 100%;
  border: 1px solid rgba(149, 181, 255, 0.16);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: #edf5ff;
  padding: 14px 16px;
  outline: none;
}

textarea {
  resize: vertical;
  line-height: 1.7;
}

.section-list {
  display: grid;
  gap: 14px;
}

.section-card {
  padding: 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(149, 181, 255, 0.12);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.image-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}

.section-tools {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.tool-hint {
  color: #93abd0;
  font-size: 12px;
  line-height: 1.5;
}

.current-image {
  margin-top: 14px;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(149, 181, 255, 0.12);
  background: rgba(255, 255, 255, 0.025);
}

.image-label {
  display: block;
  padding: 12px 14px 0;
  color: #9db4d8;
  font-size: 12px;
}

.current-image img,
.image-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.image-placeholder {
  color: #90a7cb;
}

.hint {
  margin: 12px 0 0;
  color: #93abd0;
  line-height: 1.6;
  font-size: 12px;
}

.inline-error {
  margin: 8px 0 0;
  color: #ffb4b4;
  font-size: 12px;
  line-height: 1.5;
}
</style>
