<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ContentStudioTask } from "../../../../main/types/content-studio.types";

const props = defineProps<{
  open: boolean;
  task: ContentStudioTask | null;
  saving: boolean;
  imagePreviewMap: Record<string, string>;
}>();

const emit = defineEmits<{
  close: [];
  addLocalImage: [];
  addClipboardImage: [];
  bind: [paragraphId: string, assetId: string];
  unbind: [paragraphId: string];
  deleteImage: [assetId: string];
  copyImage: [assetId: string];
  generateAiImage: [payload: { paragraphId: string; prompt: string; bindAfterGenerate: boolean }];
  generateCoverAiImage: [payload: { prompt: string; size: string }];
}>();

const selectedParagraphId = ref("");
const selectedAssetId = ref("");
const aiParagraphId = ref("");
const aiPrompt = ref("");
const aiBindAfterGenerate = ref(true);
const coverPrompt = ref("");
const coverSize = ref("16:9");

const paragraphs = computed(() => props.task?.result?.paragraphs ?? []);
const assets = computed(() => props.task?.imageAssets ?? []);
const bindings = computed(() => props.task?.imageBindings ?? []);
const coverAssets = computed(() =>
  assets.value.filter((asset) =>
    asset.sourceType === "generated" && String(asset.caption || "").includes("用途：封面")
  )
);
const normalAssets = computed(() =>
  assets.value.filter((asset) =>
    !(asset.sourceType === "generated" && String(asset.caption || "").includes("用途：封面"))
  )
);

watch(
  () => [props.open, props.task?.taskId, props.task?.result?.coverStyleSuggestion],
  () => {
    if (!props.open) {
      return;
    }
    coverPrompt.value = String(props.task?.result?.coverStyleSuggestion || "");
  },
  { immediate: true }
);

function getBindingByParagraphId(paragraphId: string): string {
  return bindings.value.find((item) => item.paragraphId === paragraphId)?.assetId || "";
}

function syncAiPrompt(): void {
  const paragraph = paragraphs.value.find((item) => item.paragraphId === aiParagraphId.value);
  if (!paragraph) {
    return;
  }
  aiPrompt.value = paragraph.imagePlan?.prompt || paragraph.imagePlan?.caption || "";
}

function submitAiGenerate(): void {
  emit("generateAiImage", {
    paragraphId: aiParagraphId.value,
    prompt: aiPrompt.value,
    bindAfterGenerate: aiBindAfterGenerate.value
  });
}

function submitCoverAiGenerate(): void {
  emit("generateCoverAiImage", {
    prompt: coverPrompt.value,
    size: coverSize.value
  });
}
</script>

<template>
  <div v-if="props.open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <header class="modal-header">
        <div>
          <h3>图片池</h3>
          <p>上传图片、绑定段落、删除图片（删除会自动解绑）。</p>
        </div>
        <div class="actions">
          <button class="ghost-btn" :disabled="props.saving || !props.task" @click="emit('addLocalImage')">上传本地图片</button>
          <button class="ghost-btn" :disabled="props.saving || !props.task" @click="emit('addClipboardImage')">粘贴板图片</button>
          <button class="ghost-btn" @click="emit('close')">关闭</button>
        </div>
      </header>

      <section class="bind-box">
        <h4>封面生图</h4>
        <p v-if="props.saving" class="status">AI 生图进行中，请稍候...</p>
        <div class="cover-row">
          <input v-model="coverPrompt" type="text" placeholder="封面生图提示词（可临时编辑，不会修改原文数据）" />
          <select v-model="coverSize" class="cover-size">
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
            <option value="1:1">1:1</option>
          </select>
          <button class="primary-btn" :disabled="props.saving || !coverPrompt.trim()" @click="submitCoverAiGenerate">
            封面生图（使用封面提示词）
          </button>
          <p class="hint">默认来源：{{ props.task?.result?.coverStyleSuggestion?.trim() || "当前文章没有封面风格建议" }}</p>
        </div>
        <div v-if="coverAssets.length" class="cover-result-list">
          <article v-for="asset in coverAssets" :key="`cover-${asset.assetId}`" class="item">
            <img v-if="props.imagePreviewMap[asset.assetId]" class="thumb" :src="props.imagePreviewMap[asset.assetId]" :alt="asset.fileName" />
            <p class="title">{{ asset.fileName }}</p>
            <p class="meta">封面图</p>
            <button class="ghost-btn" :disabled="props.saving" @click="emit('copyImage', asset.assetId)">复制图片</button>
            <button class="danger-btn" :disabled="props.saving" @click="emit('deleteImage', asset.assetId)">删除</button>
          </article>
        </div>
      </section>

      <section class="bind-box">
        <h4>绑定到段落</h4>
        <div class="bind-row">
          <select v-model="selectedParagraphId">
            <option value="">选择段落</option>
            <option v-for="paragraph in paragraphs" :key="paragraph.paragraphId" :value="paragraph.paragraphId">
              {{ paragraph.paragraphId }}
            </option>
          </select>
          <select v-model="selectedAssetId">
            <option value="">选择图片</option>
            <option v-for="asset in assets" :key="asset.assetId" :value="asset.assetId">
              {{ asset.fileName }}
            </option>
          </select>
          <button class="primary-btn" :disabled="!selectedParagraphId || !selectedAssetId || props.saving" @click="emit('bind', selectedParagraphId, selectedAssetId)">绑定</button>
          <button class="ghost-btn" :disabled="!selectedParagraphId || props.saving" @click="emit('unbind', selectedParagraphId)">解绑</button>
        </div>
      </section>

      <section class="bind-box">
        <h4>AI 生图</h4>
        <p v-if="props.saving" class="status">AI 生图进行中，请稍候...</p>
        <div class="bind-row ai-row">
          <select v-model="aiParagraphId" @change="syncAiPrompt">
            <option value="">选择段落（可选）</option>
            <option v-for="paragraph in paragraphs" :key="paragraph.paragraphId" :value="paragraph.paragraphId">
              {{ paragraph.paragraphId }}
            </option>
          </select>
          <input v-model="aiPrompt" type="text" placeholder="输入或自动带出 imagePlan.prompt" />
          <label class="check">
            <input v-model="aiBindAfterGenerate" type="checkbox" />
            生成后自动绑定到段落
          </label>
          <button class="primary-btn" :disabled="!aiPrompt.trim() || props.saving" @click="submitAiGenerate">
            {{ props.saving ? "生成中..." : "生成 AI 图片" }}
          </button>
        </div>

      </section>

      <div class="list">
        <article v-for="asset in normalAssets" :key="asset.assetId" class="item">
          <img v-if="props.imagePreviewMap[asset.assetId]" class="thumb" :src="props.imagePreviewMap[asset.assetId]" :alt="asset.fileName" />
          <p class="title">{{ asset.fileName }}</p>
          <p class="meta">来源：{{ asset.sourceType }}</p>
          <p class="meta">路径：{{ asset.localPath }}</p>
          <p class="meta">
            绑定段落：
            {{ bindings.filter((item) => item.assetId === asset.assetId).map((item) => item.paragraphId).join("、") || "未绑定" }}
          </p>
          <button class="ghost-btn" :disabled="props.saving" @click="emit('copyImage', asset.assetId)">复制图片</button>
          <button class="danger-btn" :disabled="props.saving" @click="emit('deleteImage', asset.assetId)">删除</button>
        </article>
      </div>

      <div class="paragraph-status">
        <h4>段落绑定状态</h4>
        <p v-for="paragraph in paragraphs" :key="paragraph.paragraphId" class="meta">
          {{ paragraph.paragraphId }}：{{ getBindingByParagraphId(paragraph.paragraphId) || "未绑定" }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; z-index: 73; display: grid; place-items: center; background: rgba(5,10,20,0.7); }
.modal-card { width: min(980px, calc(100vw - 40px)); max-height: 88vh; overflow: auto; padding: 20px; border-radius: 16px; border: 1px solid rgba(149,181,255,0.16); background: #0e1626; display: grid; gap: 12px; }
.modal-header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.modal-header h3 { margin: 0; }
.modal-header p { margin: 6px 0 0; color: #9cb3d7; }
.actions { display: flex; gap: 8px; }
.bind-box { border: 1px solid rgba(149,181,255,0.14); border-radius: 12px; padding: 10px; display: grid; gap: 8px; }
.bind-box h4, .paragraph-status h4 { margin: 0; color: #eaf3ff; }
.bind-row { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 8px; }
select { border-radius: 8px; border: 1px solid rgba(140,173,247,0.2); background: rgba(255,255,255,0.02); color: #eaf3ff; padding: 8px; }
.ai-row { grid-template-columns: 1fr 2fr auto auto; }
input[type="text"] { border-radius: 8px; border: 1px solid rgba(140,173,247,0.2); background: rgba(255,255,255,0.02); color: #eaf3ff; padding: 8px; }
.check { display: flex; gap: 6px; align-items: center; color: #9cb3d7; font-size: 12px; }
.status { margin: 0; color: #7bd0ff; font-size: 13px; }
.cover-row { display: grid; gap: 6px; margin-top: 6px; }
.cover-size { max-width: 180px; }
.cover-result-list { display: grid; gap: 10px; margin-top: 8px; }
.hint { margin: 0; color: #9cb3d7; font-size: 12px; }
.list { display: grid; gap: 10px; }
.item { border: 1px solid rgba(149,181,255,0.14); border-radius: 12px; padding: 12px; display: grid; gap: 7px; }
.thumb { width: 160px; max-width: 100%; border-radius: 8px; border: 1px solid rgba(149,181,255,0.2); }
.title { margin: 0; color: #eaf3ff; font-weight: 700; }
.meta { margin: 0; color: #9cb3d7; font-size: 13px; word-break: break-all; }
.ghost-btn, .primary-btn, .danger-btn { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); cursor: pointer; font-weight: 600; }
.ghost-btn { background: rgba(255,255,255,0.03); color: #eaf3ff; }
.primary-btn { background: linear-gradient(135deg, #79f0d5, #47b9ff); color: #08111f; }
.danger-btn { background: rgba(255,110,110,0.12); color: #ffd8d8; border-color: rgba(255,110,110,0.26); justify-self: start; }
@media (max-width: 900px) { .bind-row { grid-template-columns: 1fr; } }
</style>
