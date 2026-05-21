<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ContentStudioMaterialPack, MaterialRewriteInput, MaterialAdvancedSettings } from "../../../../main/types/content-studio.types";

const props = defineProps<{
  tabReady: boolean;
  missingItems: string[];
  running?: boolean;
  materialPack?: ContentStudioMaterialPack | null;
  progressLabel?: string;
  materialAdvanced?: MaterialAdvancedSettings | null;
}>();

const emit = defineEmits<{
  openModelSettings: [];
  openRunLog: [];
  openSourceModal: [];
  startMaterialRewrite: [payload: MaterialRewriteInput];
  updateMaterialAdvanced: [payload: MaterialAdvancedSettings];
}>();
const platform = ref<MaterialRewriteInput["platform"]>("公众号");
const articleType = ref<MaterialRewriteInput["articleType"]>("观点文");
const targetReader = ref("");
const writingStyle = ref("");
const wordRange = ref("1200-1800字");
const generateTitleCandidates = ref(true);
const generateCoverText = ref(true);
const generateImagePlan = ref(true);
const topicReviewRounds = ref(2);
const articleReviewRounds = ref(2);

// 从父组件加载设置
watch(() => props.materialAdvanced, (settings) => {
  if (settings) {
    platform.value = settings.platform;
    articleType.value = settings.articleType;
    targetReader.value = settings.targetReader;
    writingStyle.value = settings.writingStyle;
    wordRange.value = settings.wordRange;
    generateTitleCandidates.value = settings.generateTitleCandidates;
    generateCoverText.value = settings.generateCoverText;
    generateImagePlan.value = settings.generateImagePlan;
    topicReviewRounds.value = settings.topicReviewRounds;
    articleReviewRounds.value = settings.articleReviewRounds;
  }
}, { immediate: true });

// 保存设置到父组件
function saveSettings(): void {
  emit("updateMaterialAdvanced", {
    platform: platform.value,
    articleType: articleType.value,
    targetReader: targetReader.value,
    writingStyle: writingStyle.value,
    wordRange: wordRange.value,
    generateTitleCandidates: generateTitleCandidates.value,
    generateCoverText: generateCoverText.value,
    generateImagePlan: generateImagePlan.value,
    topicReviewRounds: topicReviewRounds.value,
    articleReviewRounds: articleReviewRounds.value
  });
}

const sourceCount = computed(() => props.materialPack?.sources.length || 0);
const canStart = computed(() => props.tabReady && sourceCount.value > 0 && !props.running);

function startRewrite(): void {
  if (!canStart.value || !props.materialPack?.sources.length) return;
  emit("startMaterialRewrite", {
    platform: platform.value,
    articleType: articleType.value,
    targetReader: targetReader.value.trim() || undefined,
    writingStyle: writingStyle.value.trim() || undefined,
    wordRange: wordRange.value.trim() || undefined,
    generateTitleCandidates: generateTitleCandidates.value,
    generateCoverText: generateCoverText.value,
    generateImagePlan: generateImagePlan.value,
    topicReviewRounds: topicReviewRounds.value,
    articleReviewRounds: articleReviewRounds.value,
    maxSourceCount: 5,
    collectImagesFromUrl: true,
    sources: props.materialPack.sources
  });
}
</script>

<template>
  <section class="tab-panel">
    <header class="panel-header">
      <div>
        <h3>素材二创</h3>
        <p>聚合文本、URL、Word 等素材，进行原创重组与风险审稿。</p>
      </div>
      <div class="header-actions">
        <button class="ghost-btn" @click="emit('openRunLog')">运行记录</button>
        <button class="ghost-btn" @click="emit('openModelSettings')">模型配置</button>
      </div>
    </header>

    <p v-if="!props.tabReady" class="warning">当前配置未完成：{{ props.missingItems.join("、") || "请先配置模型" }}</p>
    <p v-if="props.progressLabel" class="progress-line">{{ props.progressLabel }}</p>

    <div class="form-grid">
      <label class="field">
        <span>平台</span>
        <select v-model="platform" @change="saveSettings">
          <option>公众号</option>
          <option>今日头条</option>
          <option>小红书</option>
          <option>知乎</option>
          <option>CSDN</option>
        </select>
      </label>
      <label class="field">
        <span>文章类型</span>
        <select v-model="articleType" @change="saveSettings">
          <option>观点文</option>
          <option>科普文</option>
          <option>热点解读</option>
          <option>干货文</option>
          <option>种草文</option>
          <option>微头条</option>
        </select>
      </label>
      <label class="field">
        <span>目标读者</span>
        <input v-model="targetReader" type="text" placeholder="例如：职场新人" @blur="saveSettings" />
      </label>
      <label class="field">
        <span>写作风格</span>
        <input v-model="writingStyle" type="text" placeholder="例如：观点鲜明、干货向" @blur="saveSettings" />
      </label>
      <label class="field">
        <span>字数范围</span>
        <input v-model="wordRange" type="text" @blur="saveSettings" />
      </label>
      <label class="field">
        <span>选题评判轮次</span>
        <input v-model.number="topicReviewRounds" type="number" min="1" max="5" @change="saveSettings" />
      </label>
      <label class="field">
        <span>正文评审轮次</span>
        <input v-model.number="articleReviewRounds" type="number" min="1" max="5" @change="saveSettings" />
      </label>
      <label class="field check">
        <input v-model="generateTitleCandidates" type="checkbox" @change="saveSettings" />
        <span>生成标题候选</span>
      </label>
      <label class="field check">
        <input v-model="generateCoverText" type="checkbox" @change="saveSettings" />
        <span>生成封面文案</span>
      </label>
      <label class="field check">
        <input v-model="generateImagePlan" type="checkbox" @change="saveSettings" />
        <span>生成配图计划</span>
      </label>
    </div>

    <div class="placeholder-box">
      <p>当前素材数：{{ sourceCount }}</p>
      <button class="ghost-btn" @click="emit('openSourceModal')">添加/管理素材</button>
      <div class="source-list" v-if="props.materialPack?.sources.length">
        <div v-for="item in props.materialPack.sources" :key="item.sourceId" class="source-item">
          <strong>{{ item.title || item.sourceId }}</strong>
          <p>{{ item.type }} · {{ item.body.length }} 字</p>
        </div>
      </div>
      <div class="actions">
        <button class="primary-btn" :disabled="!canStart" @click="startRewrite">
          {{ props.running ? "二创中..." : "开始二创" }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tab-panel { display: grid; gap: 16px; }
.panel-header { display: flex; justify-content: space-between; gap: 12px; }
.panel-header h3 { margin: 0; font-size: 26px; }
.panel-header p { margin: 8px 0 0; color: #9cb3d7; }
.header-actions, .actions { display: flex; gap: 10px; }
.warning { margin: 0; color: #ffc1a8; }
.progress-line { margin: 0; color: #7bd0ff; }
.form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.field { display: grid; gap: 6px; }
.field span { color: #9db4d8; font-size: 12px; }
.field input, .field select {
  min-height: 40px; padding: 8px 10px; border-radius: 10px;
  border: 1px solid rgba(149,181,255,0.16); background: rgba(255,255,255,0.03); color: #edf5ff;
}
.field.check { display: flex; align-items: center; gap: 8px; }
.placeholder-box { padding: 16px; border-radius: 14px; border: 1px solid rgba(149,181,255,0.12); background: rgba(255,255,255,0.02); display: grid; gap: 14px; }
.placeholder-box p { margin: 0; color: #9cb3d7; }
.source-list { display: grid; gap: 8px; }
.source-item { border: 1px solid rgba(149,181,255,0.12); border-radius: 10px; padding: 8px; background: rgba(255,255,255,0.02); }
.source-item p { margin: 6px 0 0; font-size: 12px; color: #9db4d8; }
.ghost-btn, .primary-btn { min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); cursor: pointer; font-weight: 600; }
.ghost-btn { background: rgba(255,255,255,0.03); color: #eaf3ff; }
.primary-btn { background: linear-gradient(135deg, #79f0d5, #47b9ff); color: #08111f; }
@media (max-width: 1100px) {
  .panel-header, .header-actions, .actions { flex-direction: column; align-items: stretch; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
