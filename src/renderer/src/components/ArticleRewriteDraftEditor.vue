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
}>();

const editableDraft = ref<PostDraft | null>(null);
const imageUrls = ref<Record<string, string>>({});
const rewritingSectionId = ref<string | null>(null);
const rewriteError = ref<{ sectionId: string; message: string } | null>(null);
const showRewriteDraftDialog = ref(false);
const rewritingDraft = ref(false);
const rewriteDraftError = ref("");
const rewriteTitle = ref(true);
const rewriteUserPrompt = ref("");

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
  const grouped: Record<string, Extract<PostDraft["contentBlocks"][number], { type: "image" }>[]> = {};
  if (!editableDraft.value) return grouped;

  for (const block of editableDraft.value.contentBlocks) {
    if (block.type !== "image") continue;
    if (!grouped[block.sectionId]) grouped[block.sectionId] = [];
    grouped[block.sectionId].push(block);
  }

  return grouped;
});

function emitDraftChange(): void {
  if (!editableDraft.value) return;
  emit("change", JSON.parse(JSON.stringify(editableDraft.value)) as PostDraft);
}

function updateTitle(value: string): void {
  if (!editableDraft.value) return;
  editableDraft.value.title = value;
  emitDraftChange();
}

function updateSectionParagraph(sectionId: string, value: string): void {
  if (!editableDraft.value) return;

  const section = editableDraft.value.sections.find((item) => item.sectionId === sectionId);
  if (!section) return;

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
  emitDraftChange();
}

function moveImageToSection(blockId: string, targetSectionId: string): void {
  if (!editableDraft.value) return;
  const blocks = editableDraft.value.contentBlocks;
  const imageIndex = blocks.findIndex((block) => block.type === "image" && block.blockId === blockId);
  if (imageIndex === -1) return;

  const imageBlock = blocks[imageIndex];
  if (imageBlock.type !== "image") return;
  if (imageBlock.sectionId === targetSectionId) return;

  const moved = { ...imageBlock, sectionId: targetSectionId };
  const nextBlocks = [...blocks];
  nextBlocks.splice(imageIndex, 1);

  let insertAt = -1;
  for (let i = 0; i < nextBlocks.length; i += 1) {
    if (nextBlocks[i].sectionId === targetSectionId) {
      insertAt = i;
    }
  }

  if (insertAt >= 0) {
    nextBlocks.splice(insertAt + 1, 0, moved);
  } else {
    nextBlocks.push(moved);
  }

  editableDraft.value.contentBlocks = nextBlocks;
  emitDraftChange();
}

async function rewriteSectionParagraph(sectionId: string): Promise<void> {
  if (!editableDraft.value || rewritingSectionId.value) return;

  const section = editableDraft.value.sections.find((item) => item.sectionId === sectionId);
  if (!section || !section.paragraph.trim()) return;

  rewritingSectionId.value = sectionId;
  rewriteError.value = null;

  try {
    const rewrittenParagraph = await desktopApi.rewriteArticleRewriteParagraph({ paragraph: section.paragraph });
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

async function rewriteWholeDraft(): Promise<void> {
  if (!editableDraft.value || rewritingDraft.value) return;

  rewritingDraft.value = true;
  rewriteDraftError.value = "";

  try {
    const updatedDraft = await desktopApi.rewriteArticleRewriteDraft({
      draft: editableDraft.value,
      userPrompt: rewriteUserPrompt.value,
      rewriteTitle: rewriteTitle.value
    });

    editableDraft.value = JSON.parse(JSON.stringify(updatedDraft)) as PostDraft;
    emit("change", JSON.parse(JSON.stringify(updatedDraft)) as PostDraft);
    showRewriteDraftDialog.value = false;
  } catch (error) {
    rewriteDraftError.value = error instanceof Error ? error.message : "整体洗稿失败";
  } finally {
    rewritingDraft.value = false;
  }
}

async function rewriteIterativeDraft(): Promise<void> {
  if (!editableDraft.value || rewritingDraft.value) return;

  rewritingDraft.value = true;
  rewriteDraftError.value = "";

  try {
    const updatedDraft = await desktopApi.rewriteArticleRewriteDraftIterative({
      draft: editableDraft.value,
      userPrompt: rewriteUserPrompt.value,
      rewriteTitle: rewriteTitle.value
    });

    editableDraft.value = JSON.parse(JSON.stringify(updatedDraft)) as PostDraft;
    emit("change", JSON.parse(JSON.stringify(updatedDraft)) as PostDraft);
    showRewriteDraftDialog.value = false;
  } catch (error) {
    rewriteDraftError.value = error instanceof Error ? error.message : "迭代洗稿失败";
  } finally {
    rewritingDraft.value = false;
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
        <div class="header-actions">
          <button class="rewrite-btn" :disabled="rewritingDraft" @click="showRewriteDraftDialog = true">重新洗稿</button>
          <button class="save-btn" :disabled="saving" @click="emit('save')">{{ saving ? "保存中..." : "保存草稿" }}</button>
        </div>
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
            <button class="action-btn" :disabled="Boolean(rewritingSectionId) || !section.paragraph.trim()" @click="rewriteSectionParagraph(section.sectionId)">
              {{ rewritingSectionId === section.sectionId ? "洗稿中..." : "LLM 洗稿重写" }}
            </button>
            <span class="tool-hint">把当前段落发给 LLM，重新生成一个新的表达版本。</span>
          </div>

          <p v-if="rewriteError?.sectionId === section.sectionId" class="inline-error">{{ rewriteError.message }}</p>

          <div v-if="(imageBlocksBySection[section.sectionId] ?? []).length > 0" class="image-list">
            <article v-for="imageBlock in imageBlocksBySection[section.sectionId]" :key="imageBlock.blockId" class="image-item">
              <div class="current-image">
                <span class="image-label">当前图片</span>
                <img v-if="imageUrls[imageBlock.blockId]" :src="imageUrls[imageBlock.blockId]" :alt="`${section.sectionId} 当前图片`" />
                <div v-else class="image-placeholder">图片加载中...</div>
              </div>

              <div class="image-actions">
                <button class="action-btn" :disabled="replacingImageBlockId === imageBlock.blockId" @click="emit('replaceImage', imageBlock.blockId)">
                  {{ replacingImageBlockId === imageBlock.blockId ? "替换中..." : "上传替换图片" }}
                </button>
                <select class="section-select" :value="imageBlock.sectionId" @change="moveImageToSection(imageBlock.blockId, ($event.target as HTMLSelectElement).value)">
                  <option v-for="target in editableDraft.sections" :key="target.sectionId" :value="target.sectionId">
                    移动到 {{ target.sectionId }}
                  </option>
                </select>
              </div>
            </article>
          </div>

          <p v-else class="hint">当前段落暂无图片。</p>
        </article>
      </div>
    </div>

    <div v-if="showRewriteDraftDialog" class="modal-mask">
      <div class="rewrite-dialog">
        <div class="dialog-header">
          <div>
            <span class="eyebrow">Rewrite Draft</span>
            <h3>整体重新洗稿</h3>
          </div>
          <button class="ghost-btn" @click="showRewriteDraftDialog = false">关闭</button>
        </div>

        <label class="check-row">
          <input v-model="rewriteTitle" type="checkbox" />
          <span>同时重写标题</span>
        </label>

        <label class="field">
          <span>个性化洗稿要求</span>
          <textarea
            v-model="rewriteUserPrompt"
            rows="8"
            placeholder="示例：请改成适合微头条发布的风格，开头要更有冲突感，语言更口语化，每段不要太长，整体控制在 600 字以内，不要像新闻稿。"
          />
        </label>

        <p v-if="rewriteDraftError" class="inline-error">{{ rewriteDraftError }}</p>

        <div class="dialog-footer">
          <button class="ghost-btn" :disabled="rewritingDraft" @click="showRewriteDraftDialog = false">取消</button>
          <button class="ghost-btn" :disabled="rewritingDraft" @click="rewriteWholeDraft">
            {{ rewritingDraft ? "重新洗稿中..." : "重新洗稿" }}
          </button>
          <button class="action-btn" :disabled="rewritingDraft" @click="rewriteIterativeDraft">
            {{ rewritingDraft ? "迭代洗稿中..." : "迭代洗稿" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.editor-shell { height: 100%; padding: 24px; overflow: auto; border-radius: 32px; background: linear-gradient(180deg, rgba(13, 21, 36, .98), rgba(8, 13, 24, .98)); border: 1px solid rgba(154, 186, 255, .12); }
.empty-state { height: 100%; display: flex; flex-direction: column; justify-content: center; }
.editor-content { display: grid; gap: 18px; }
.editor-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.header-actions { display: flex; gap: 10px; }
.rewrite-btn { min-height: 42px; padding: 0 18px; border-radius: 12px; border: 1px solid rgba(140, 173, 247, .14); background: rgba(255,255,255,.03); color: #eaf3ff; cursor: pointer; font-weight: 600; }
.rewrite-btn:disabled { opacity: .56; cursor: not-allowed; }
.eyebrow { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: #79c8ff; }
h3 { margin: 10px 0 0; font-size: 28px; }
.save-btn,.action-btn,.ghost-btn { min-height: 42px; border-radius: 12px; border: 1px solid rgba(140,173,247,.14); cursor: pointer; font-weight: 600; }
.save-btn,.action-btn { background: linear-gradient(135deg, #6bc3ff, #3f7df7); color: #08111f; }
.ghost-btn { background: rgba(255,255,255,.03); color: #eaf3ff; }
.save-btn:disabled,.action-btn:disabled,.ghost-btn:disabled { opacity: .56; cursor: not-allowed; }
.field { display: grid; gap: 10px; }
.field span,.section-header span { color: #9db4d8; font-size: 12px; }
input,textarea,.section-select { width: 100%; border: 1px solid rgba(149,181,255,.16); border-radius: 14px; background: rgba(255,255,255,.03); color: #edf5ff; padding: 14px 16px; outline: none; }
textarea { resize: vertical; line-height: 1.7; }
.section-list { display: grid; gap: 14px; }
.section-card { padding: 18px; border-radius: 20px; background: rgba(255,255,255,.025); border: 1px solid rgba(149,181,255,.12); }
.section-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.section-tools { display: grid; gap: 8px; margin-top: 12px; }
.tool-hint { color: #93abd0; font-size: 12px; line-height: 1.5; }
.image-list { display: grid; gap: 12px; margin-top: 14px; }
.image-item { border: 1px solid rgba(149,181,255,.12); border-radius: 14px; padding: 10px; background: rgba(255,255,255,.015); }
.current-image { overflow: hidden; border-radius: 12px; border: 1px solid rgba(149,181,255,.12); background: rgba(255,255,255,.025); }
.image-label { display: block; padding: 12px 14px 0; color: #9db4d8; font-size: 12px; }
.current-image img,.image-placeholder { display: grid; place-items: center; width: 100%; aspect-ratio: 16/9; object-fit: cover; }
.image-placeholder { color: #90a7cb; }
.image-actions { display: grid; grid-template-columns: 1fr 220px; gap: 10px; margin-top: 10px; }
.hint { margin: 12px 0 0; color: #93abd0; line-height: 1.6; font-size: 12px; }
.inline-error { margin: 8px 0 0; color: #ffb4b4; font-size: 12px; line-height: 1.5; }
.modal-mask { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(3,8,16,.74); backdrop-filter: blur(6px); }
.rewrite-dialog { width: min(620px, calc(100vw - 48px)); max-height: min(820px, calc(100vh - 48px)); padding: 24px; overflow: auto; border-radius: 28px; border: 1px solid rgba(149,181,255,.16); background: linear-gradient(180deg, rgba(14,21,36,.98), rgba(8,13,24,.98)); display: grid; gap: 18px; }
.dialog-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.check-row { display: flex; align-items: center; gap: 10px; cursor: pointer; color: #c8daf5; font-size: 14px; }
.check-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: #6bc3ff; cursor: pointer; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
</style>
