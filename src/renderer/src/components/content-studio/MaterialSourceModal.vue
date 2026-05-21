<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ContentStudioMaterialPack } from "../../../../main/types/content-studio.types";

const props = defineProps<{
  open: boolean;
  materialPack: ContentStudioMaterialPack;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  addText: [payload: { title?: string; body: string }];
  addUrl: [payload: { url: string; title?: string; extractMode?: "llm" | "browser" }];
  addWord: [];
  removeSource: [sourceId: string];
  updateSourceBody: [payload: { sourceId: string; body: string }];
}>();

const textTitle = ref("");
const textBody = ref("");
const urlInput = ref("");
const urlTitle = ref("");
const urlExtractMode = ref<"llm" | "browser">("llm");

const sourceCount = computed(() => props.materialPack.sources.length);
const draftBodies = ref<Record<string, string>>({});

watch(
  () => props.materialPack.sources,
  (sources) => {
    const next: Record<string, string> = {};
    for (const source of sources) {
      next[source.sourceId] = draftBodies.value[source.sourceId] ?? source.body;
    }
    draftBodies.value = next;
  },
  { immediate: true, deep: true }
);

function submitText(): void {
  const body = textBody.value.trim();
  if (!body) return;
  emit("addText", { title: textTitle.value.trim() || undefined, body });
  textTitle.value = "";
  textBody.value = "";
}

function submitUrl(): void {
  const url = urlInput.value.trim();
  if (!url) return;
  emit("addUrl", { url, title: urlTitle.value.trim() || undefined, extractMode: urlExtractMode.value });
  urlInput.value = "";
  urlTitle.value = "";
}

function saveSourceBody(sourceId: string, body: string): void {
  const nextBody = String(body || "").trim();
  if (!nextBody) return;
  emit("updateSourceBody", { sourceId, body: nextBody });
}

function isDirty(sourceId: string, originalBody: string): boolean {
  return String(draftBodies.value[sourceId] || "") !== String(originalBody || "");
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <header class="modal-header">
        <h3>素材管理</h3>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </header>

      <p class="summary">当前素材：{{ sourceCount }} 条</p>

      <div class="input-grid">
        <label class="field">
          <span>文本素材标题（可选）</span>
          <input v-model="textTitle" type="text" placeholder="例如：原文标题" />
        </label>
        <label class="field full">
          <span>文本素材正文</span>
          <textarea v-model="textBody" rows="4" placeholder="粘贴原文正文"></textarea>
        </label>
        <button class="ghost-btn" :disabled="busy" @click="submitText">添加文本素材</button>
      </div>

      <div class="input-grid">
        <label class="field">
          <span>网页 URL</span>
          <input v-model="urlInput" type="text" placeholder="https://..." />
        </label>
        <label class="field">
          <span>URL 标题（可选）</span>
          <input v-model="urlTitle" type="text" placeholder="不填则自动抓取" />
        </label>
        <label class="field">
          <span>提取模式</span>
          <select v-model="urlExtractMode">
            <option value="llm">LLM直接读取（默认）</option>
            <option value="browser">浏览器爬取</option>
          </select>
        </label>
        <button class="ghost-btn" :disabled="busy" @click="submitUrl">添加 URL 素材</button>
        <button class="ghost-btn" :disabled="busy" @click="emit('addWord')">导入 Word 素材</button>
      </div>

      <div class="list-box">
        <article v-for="source in materialPack.sources" :key="source.sourceId" class="source-card">
          <div class="row">
            <strong>{{ source.title || source.sourceId }}</strong>
            <button class="tiny-btn" :disabled="busy" @click="emit('removeSource', source.sourceId)">删除</button>
          </div>
          <p>{{ source.type }} · {{ source.body.length }} 字 · 图片 {{ source.images?.length || 0 }}</p>
          <details class="preview">
            <summary>预览正文</summary>
            <pre>{{ source.body.slice(0, 3000) }}</pre>
          </details>
          <details class="preview">
            <summary>编辑正文</summary>
            <textarea v-model="draftBodies[source.sourceId]" rows="6"></textarea>
            <div class="edit-actions">
              <button
                class="tiny-btn"
                :disabled="busy || !isDirty(source.sourceId, source.body)"
                @click="saveSourceBody(source.sourceId, draftBodies[source.sourceId] || '')"
              >
                保存正文
              </button>
            </div>
            <p class="tip">修改后请点击“保存正文”写入当前素材包。</p>
          </details>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; z-index: 66; display: grid; place-items: center; background: rgba(5,10,20,0.7); }
.modal-card { width: min(840px, calc(100vw - 48px)); max-height: calc(100vh - 64px); overflow: auto; padding: 20px; border-radius: 16px; border: 1px solid rgba(149,181,255,0.16); background: #0e1626; display: grid; gap: 12px; }
.modal-header { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.summary { margin: 0; color: #9cb3d7; }
.input-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.field { display: grid; gap: 6px; }
.field span { color: #9db4d8; font-size: 12px; }
.field input,.field textarea { min-height: 40px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(149,181,255,0.16); background: rgba(255,255,255,0.03); color: #edf5ff; }
.field textarea { min-height: 96px; resize: vertical; }
.field.full { grid-column: 1 / -1; }
.list-box { display: grid; gap: 8px; }
.source-card { border: 1px solid rgba(149,181,255,0.12); border-radius: 10px; padding: 10px; background: rgba(255,255,255,0.02); }
.row { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.source-card p { margin: 6px 0 0; color: #9cb3d7; font-size: 12px; }
.preview { margin-top: 8px; }
.preview summary { cursor: pointer; color: #9db4d8; font-size: 12px; }
.preview pre { margin: 8px 0 0; white-space: pre-wrap; color: #dbe8ff; font-size: 12px; max-height: 180px; overflow: auto; }
.preview textarea { margin-top: 8px; width: 100%; min-height: 120px; resize: vertical; border-radius: 8px; border: 1px solid rgba(149,181,255,0.16); background: rgba(255,255,255,0.03); color: #edf5ff; padding: 8px; }
.edit-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.tip { margin: 6px 0 0; color: #9db4d8; font-size: 12px; }
.close-btn,.ghost-btn,.tiny-btn { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); background: rgba(255,255,255,0.03); color: #eaf3ff; cursor: pointer; }
.tiny-btn { min-height: 28px; font-size: 12px; }
@media (max-width: 1100px) { .input-grid { grid-template-columns: 1fr; } }
</style>
