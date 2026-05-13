<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import type { ArticleRewriteConfigStatus, ArticleRewriteSettings, DraftSummary, PostDraft } from "../../../main/types/app.types";
import { desktopApi } from "../api/desktop-api";
import ArticleRewriteSettingsModal from "../components/ArticleRewriteSettingsModal.vue";
import ArticleRewriteDraftEditor from "../components/ArticleRewriteDraftEditor.vue";
import DraftShelfModal from "../components/DraftShelfModal.vue";
import PostPreview from "../components/PostPreview.vue";

const router = useRouter();

const selectedWordPath = ref<string | null>(null);
const draft = ref<PostDraft | null>(null);
const drafts = ref<DraftSummary[]>([]);
const activeDraftId = ref<string | null>(null);
const loadingDrafts = ref(false);
const draftModalOpen = ref(false);
const settingsOpen = ref(false);
const settingsSaving = ref(false);
const toolSettings = ref<ArticleRewriteSettings | null>(null);
const configStatus = ref<ArticleRewriteConfigStatus | null>(null);
const busy = ref(false);
const savingDraft = ref(false);
const exportingWord = ref(false);
const exportingImagesArchive = ref(false);
const replacingImageBlockId = ref<string | null>(null);
const editorOpen = ref(false);
const generationUserPrompt = ref("");
const errorMessage = ref("");

void refreshDrafts(true);
void loadConfigStatus();

async function loadConfigStatus(): Promise<void> {
  configStatus.value = await desktopApi.getArticleRewriteConfigStatus();
}

async function openToolSettings(): Promise<void> {
  toolSettings.value = await desktopApi.getArticleRewriteSettings();
  configStatus.value = await desktopApi.getArticleRewriteConfigStatus();
  settingsOpen.value = true;
}

async function saveToolSettings(nextSettings: ArticleRewriteSettings): Promise<void> {
  settingsSaving.value = true;
  try {
    toolSettings.value = await desktopApi.saveArticleRewriteSettings(nextSettings);
    configStatus.value = await desktopApi.getArticleRewriteConfigStatus();
    settingsOpen.value = false;
  } finally {
    settingsSaving.value = false;
  }
}

async function handleSelectWord(): Promise<void> {
  errorMessage.value = "";
  selectedWordPath.value = await desktopApi.selectWord();
}

async function handleImportWord(): Promise<void> {
  if (!selectedWordPath.value || busy.value) return;
  if (!configStatus.value?.ready) {
    errorMessage.value = "请先配置图文改写模块的 LLM Key。";
    return;
  }

  busy.value = true;
  errorMessage.value = "";
  try {
    draft.value = await desktopApi.importArticleRewriteWordDraft(selectedWordPath.value);
    activeDraftId.value = draft.value.draftId;
    editorOpen.value = false;
    await refreshDrafts();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "导入 Word 失败";
  } finally {
    busy.value = false;
  }
}

async function handleGenerateFromPrompt(): Promise<void> {
  if (!draft.value || busy.value) return;
  busy.value = true;
  errorMessage.value = "";
  try {
    draft.value = await desktopApi.rewriteArticleRewriteDraft({
      draft: draft.value,
      userPrompt: generationUserPrompt.value,
      rewriteTitle: true
    });
    await refreshDrafts();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "生成新文章失败";
  } finally {
    busy.value = false;
  }
}

async function handleExportWord(): Promise<void> {
  if (!draft.value || exportingWord.value) return;
  exportingWord.value = true;
  errorMessage.value = "";
  try {
    await desktopApi.exportArticleRewriteDraftToWord(draft.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "导出 Word 失败";
  } finally {
    exportingWord.value = false;
  }
}

async function handleExportImagesArchive(): Promise<void> {
  if (!draft.value || exportingImagesArchive.value) return;
  exportingImagesArchive.value = true;
  errorMessage.value = "";
  try {
    await desktopApi.exportArticleRewriteDraftImagesArchive(draft.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "导出文章配图失败";
  } finally {
    exportingImagesArchive.value = false;
  }
}

async function refreshDrafts(openLatest = false): Promise<void> {
  loadingDrafts.value = true;
  try {
    drafts.value = await desktopApi.listArticleRewriteDrafts();
    if (openLatest && drafts.value.length > 0) {
      await openDraft(drafts.value[0].draftId);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "读取草稿失败";
  } finally {
    loadingDrafts.value = false;
  }
}

async function openDraft(draftId: string): Promise<void> {
  errorMessage.value = "";
  draft.value = await desktopApi.getArticleRewriteDraftById(draftId);
  activeDraftId.value = draftId;
  editorOpen.value = false;
}

async function openDraftModal(): Promise<void> {
  draftModalOpen.value = true;
  await refreshDrafts();
}

function handleDraftChange(nextDraft: PostDraft): void {
  draft.value = nextDraft;
}

async function saveDraftEdits(): Promise<void> {
  if (!draft.value || savingDraft.value) return;
  savingDraft.value = true;
  errorMessage.value = "";
  try {
    draft.value = await desktopApi.saveArticleRewriteDraft(draft.value);
    await refreshDrafts();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存草稿失败";
  } finally {
    savingDraft.value = false;
  }
}

async function replaceDraftImage(blockId?: string): Promise<void> {
  if (!draft.value || !blockId) return;
  const selectedImagePath = await desktopApi.selectImage();
  if (!selectedImagePath) return;

  replacingImageBlockId.value = blockId;
  errorMessage.value = "";
  try {
    draft.value = await desktopApi.replaceArticleRewriteDraftImage(draft.value.draftId, blockId, selectedImagePath);
    await refreshDrafts();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "替换图片失败";
  } finally {
    replacingImageBlockId.value = null;
  }
}

function toggleEditor(): void {
  if (!draft.value) return;
  editorOpen.value = !editorOpen.value;
}
</script>

<template>
  <section class="video-page">
    <aside class="sidebar">
      <button class="back-btn" @click="router.push('/')">返回工具箱</button>
      <button class="draft-trigger-btn" @click="openToolSettings">工具配置</button>

      <div class="import-card">
        <span class="mode-label">Word 导入</span>
        <strong>{{ selectedWordPath || "未选择文件" }}</strong>
        <button class="draft-trigger-btn" :disabled="busy" @click="handleSelectWord">上传 Word</button>
        <button class="export-btn" :disabled="busy || !selectedWordPath" @click="handleImportWord">
          {{ busy ? "处理中..." : "解析并还原内容" }}
        </button>
      </div>

      <label class="prompt-field">
        <span>个性化提示词</span>
        <textarea v-model="generationUserPrompt" rows="6" placeholder="可输入场景提示词，如：改成小红书风格，语气更口语化。" />
      </label>

      <div class="quick-actions">
        <button class="export-btn" :disabled="!draft || busy" @click="handleGenerateFromPrompt">开始生成新文章</button>
        <button class="draft-trigger-btn" @click="openDraftModal">草稿箱</button>
        <button class="export-btn" :disabled="!draft || exportingWord" @click="handleExportWord">{{ exportingWord ? "导出中..." : "导出 Word" }}</button>
        <button class="draft-trigger-btn" :disabled="!draft || exportingImagesArchive" @click="handleExportImagesArchive">{{ exportingImagesArchive ? "导出中..." : "导出文章配图" }}</button>
      </div>

      <div class="mode-card">
        <span class="mode-label">当前模式</span>
        <strong>{{ editorOpen ? "编辑模式" : "预览模式" }}</strong>
        <button class="editor-toggle-btn" :disabled="!draft" @click="toggleEditor">
          {{ editorOpen ? "返回预览" : "进入编辑" }}
        </button>
      </div>

      <div v-if="errorMessage" class="error-card"><strong>{{ errorMessage }}</strong></div>
    </aside>

    <div v-if="!editorOpen" class="preview-column">
      <PostPreview :draft="draft" />
    </div>

    <div v-else class="editor-column">
      <ArticleRewriteDraftEditor
        :draft="draft"
        :saving="savingDraft"
        :replacing-image-block-id="replacingImageBlockId"
        
        
        @change="handleDraftChange"
        @save="saveDraftEdits"
        @replace-image="replaceDraftImage"
      />
    </div>

    <DraftShelfModal
      :open="draftModalOpen"
      :drafts="drafts"
      :active-draft-id="activeDraftId"
      :loading="loadingDrafts"
      @close="draftModalOpen = false"
      @open-draft="openDraft"
      @refresh="refreshDrafts"
    />

    <ArticleRewriteSettingsModal
      :open="settingsOpen"
      :settings="toolSettings"
      :saving="settingsSaving"
      @close="settingsOpen = false"
      @save="saveToolSettings"
    />
  </section>
</template>

<style scoped>
.video-page { height: 100%; display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 24px; padding: 24px 28px 28px; }
.sidebar { display: flex; flex-direction: column; gap: 14px; overflow: auto; }
.back-btn,.draft-trigger-btn,.export-btn,.editor-toggle-btn { min-height: 44px; border-radius: 12px; border: 1px solid rgba(140,173,247,.14); font-size: 14px; font-weight: 600; cursor: pointer; }
.back-btn,.draft-trigger-btn { background: rgba(255,255,255,.03); color: #eaf3ff; }
.export-btn,.editor-toggle-btn { background: linear-gradient(135deg, #79f0d5, #47b9ff); color: #08111f; }
.export-btn:disabled,.editor-toggle-btn:disabled { opacity: .56; cursor: not-allowed; }
.import-card,.mode-card,.error-card { padding: 14px; border-radius: 14px; border: 1px solid rgba(140,173,247,.14); background: rgba(255,255,255,.03); display: grid; gap: 10px; }
.mode-label { font-size: 12px; color: #92abd1; }
.quick-actions { display: grid; gap: 10px; }
.prompt-field { display: grid; gap: 8px; }
.prompt-field span { font-size: 12px; color: #9db4d8; }
.prompt-field textarea { width: 100%; border: 1px solid rgba(149,181,255,.16); border-radius: 12px; background: rgba(255,255,255,.03); color: #edf5ff; padding: 10px 12px; resize: vertical; }
.preview-column,.editor-column { min-height: 0; overflow: hidden; }
.error-card { color: #ffd9d9; border-color: rgba(255,106,106,.22); background: rgba(255,106,106,.08); }
@media (max-width: 1180px) { .video-page { grid-template-columns: 1fr; } }
</style>

