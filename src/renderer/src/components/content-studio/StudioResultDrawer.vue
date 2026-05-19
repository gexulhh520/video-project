<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { ContentStudioTask, TopicCreateInput } from "../../../../main/types/app.types";

const props = defineProps<{
  open: boolean;
  task: ContentStudioTask | null;
  running?: boolean;
  allowRerun?: boolean;
  stepActionPending?: { stepKey: string; action: "retry" | "restart" | "skip" } | null;
}>();

const emit = defineEmits<{
  close: [];
  viewRunLog: [];
  rerun: [];
  retryStep: [stepKey: string];
  restartFromStep: [stepKey: string];
  skipStep: [stepKey: string];
}>();

const article = computed(() => props.task?.result);
const topicInput = computed(() => (props.task?.input || null) as TopicCreateInput | null);
const statusLabel = computed(() => {
  if (props.running) return "生成中";
  if (!props.task) return "未开始";
  if (props.task.status === "completed") return "成功";
  if (props.task.status === "failed") return "失败";
  return "生成中";
});

const modelALabel = computed(() => {
  const task = props.task;
  if (!task) return "-";
  const modelA = task.settingsSnapshot.modelA;
  return `${modelA.provider} / ${modelA.profile || "未填写"}`;
});

const modelBLabel = computed(() => {
  const task = props.task;
  if (!task) return "-";
  const modelB = task.settingsSnapshot.modelB;
  return `${modelB.provider} / ${modelB.profile || "未填写"}`;
});

const shouldShowTitleCandidates = computed(() => Boolean(topicInput.value?.generateTitleCandidates));
const shouldShowCover = computed(() => Boolean(topicInput.value?.generateCoverText));
const shouldShowImagePlan = computed(() => Boolean(topicInput.value?.generateImagePlan));
const topicSteps = computed(() => props.task?.topicSteps || []);
const selectedTopic = computed(() => props.task?.selectedTopic || null);
const researchPlan = computed(() => props.task?.researchPlan || []);
const researchMaterials = computed(() => props.task?.researchMaterials || []);
const mergedMaterial = computed(() => props.task?.mergedMaterial || null);
const failedStepKey = computed(() => topicSteps.value.find((step) => step.status === "failed")?.stepKey || "");
const stepRefs = ref<Record<string, HTMLElement | null>>({});

const fullText = computed(() => {
  if (!article.value) {
    return "";
  }
  const lines: string[] = [];
  if (article.value.title?.trim()) {
    lines.push(article.value.title.trim());
  }
  if (article.value.coverText?.trim()) {
    lines.push(`封面主文案：${article.value.coverText.trim()}`);
  }
  if (article.value.coverSubText?.trim()) {
    lines.push(`封面副文案：${article.value.coverSubText.trim()}`);
  }
  const body = article.value.paragraphs.map((paragraph) => paragraph.text).filter((text) => text.trim());
  if (body.length) {
    lines.push(...body);
  }
  return lines.join("\n\n");
});
const finalReviewJson = computed(() => {
  if (!props.task?.finalReview) return "";
  return JSON.stringify(props.task.finalReview, null, 2);
});

async function copyText(text: string): Promise<void> {
  if (!text.trim()) {
    return;
  }
  await navigator.clipboard.writeText(text);
}

function setStepRef(stepKey: string, element: unknown): void {
  stepRefs.value[stepKey] = (element as HTMLElement | null) ?? null;
}

watch(
  () => [props.open, props.task?.taskId, failedStepKey.value].join(":"),
  async () => {
    if (!props.open || !failedStepKey.value) {
      return;
    }
    await nextTick();
    stepRefs.value[failedStepKey.value]?.scrollIntoView({ block: "center", behavior: "smooth" });
  },
  { immediate: true }
);
</script>

<template>
  <aside v-if="open" class="drawer-mask" @click.self="emit('close')">
    <section class="drawer">
      <header class="drawer-header">
        <div>
          <h3>{{ props.task?.tab === "material" ? "素材二创结果" : "话题成文结果" }}</h3>
          <p class="meta">状态：{{ statusLabel }}</p>
          <p class="meta">生成时间：{{ props.task?.updatedAt || "-" }}</p>
          <p class="meta">模型A：{{ modelALabel }}</p>
          <p class="meta">模型B：{{ modelBLabel }}</p>
        </div>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </header>

      <div class="toolbar">
        <button class="ghost-btn" :disabled="!fullText" @click="copyText(fullText)">复制全文</button>
        <button class="ghost-btn" :disabled="!article?.title" @click="copyText(article?.title || '')">复制标题</button>
        <button class="ghost-btn" :disabled="!article?.coverText" @click="copyText(article?.coverText || '')">复制封面文案</button>
        <button class="ghost-btn" :disabled="!finalReviewJson" @click="copyText(finalReviewJson)">复制终审JSON</button>
        <button class="ghost-btn" :disabled="!props.task?.debateSteps.length" @click="emit('viewRunLog')">查看讨论记录</button>
        <button class="ghost-btn" :disabled="props.running || !props.allowRerun" @click="emit('rerun')">重新生成</button>
      </div>

      <p v-if="props.task?.status === 'failed'" class="error-text">{{ props.task.error || "任务执行失败" }}</p>

      <template v-if="article">
        <section v-if="selectedTopic" class="section">
          <h4>最终选题</h4>
          <p><strong>标题：</strong>{{ selectedTopic.title }}</p>
          <p><strong>核心立意：</strong>{{ selectedTopic.coreThesis }}</p>
          <p><strong>内容类型：</strong>{{ selectedTopic.contentType }}</p>
          <p><strong>目标平台：</strong>{{ selectedTopic.targetPlatform }}</p>
          <p><strong>入选原因：</strong>{{ selectedTopic.reason }}</p>
        </section>

        <section v-if="researchPlan.length" class="section">
          <h4>研究计划</h4>
          <article v-for="item in researchPlan" :key="item.materialId" class="step-card">
            <p><strong>{{ item.materialId }}</strong> - {{ item.query }}</p>
            <p>用途：{{ item.purpose }}</p>
            <p>来源偏好：{{ item.preferredSourceType }} | 必需：{{ item.required ? "是" : "否" }}</p>
            <p>风险提示：{{ item.riskNotes?.join("；") || "无" }}</p>
          </article>
        </section>

        <section v-if="researchMaterials.length" class="section">
          <h4>素材卡片</h4>
          <article v-for="card in researchMaterials" :key="card.materialId" class="step-card">
            <p><strong>{{ card.materialId }}</strong> - {{ card.title }}</p>
            <p>查询：{{ card.query }}</p>
            <p>来源类型：{{ card.sourceType }} | 可信度：{{ card.confidence }}</p>
            <p>来源链接：{{ card.sourceUrl || "无" }}</p>
            <p>摘要：{{ card.summary }}</p>
            <p>可用观点：{{ card.usablePoints?.join("；") || "无" }}</p>
            <p>风险提醒：{{ card.riskNotes?.join("；") || "无" }}</p>
            <p v-if="card.errorMessage" class="error-text">失败原因：{{ card.errorMessage }}</p>
          </article>
        </section>

        <section v-if="mergedMaterial" class="section">
          <h4>合并素材包</h4>
          <p><strong>主题：</strong>{{ mergedMaterial.topic }}</p>
          <p><strong>可确认事实：</strong>{{ mergedMaterial.confirmedFacts?.join("；") || "无" }}</p>
          <p><strong>创作者问题：</strong>{{ mergedMaterial.creatorProblems?.join("；") || "无" }}</p>
          <p><strong>争议点：</strong>{{ mergedMaterial.controversies?.join("；") || "无" }}</p>
          <p><strong>内容缺口：</strong>{{ mergedMaterial.contentGaps?.join("；") || "无" }}</p>
          <p><strong>可用论点：</strong>{{ mergedMaterial.usableArguments?.join("；") || "无" }}</p>
          <p><strong>风险边界：</strong>{{ mergedMaterial.riskBoundaries?.join("；") || "无" }}</p>
        </section>

        <section v-if="topicSteps.length" class="section">
          <h4>步骤进度</h4>
          <article
            v-for="step in topicSteps"
            :key="step.stepKey"
            :ref="(el) => setStepRef(step.stepKey, el)"
            class="step-card"
            :class="{
              'step-card-failed': step.status === 'failed',
              'step-card-running': step.status === 'running',
              'step-card-pending': step.status === 'pending',
              'step-card-skipped': step.status === 'skipped',
              'step-card-success': step.status === 'success'
            }"
          >
            <p><strong>{{ step.stepName }}</strong>（{{ step.stepKey }}）</p>
            <p>状态：{{ step.status }} | 尝试次数：{{ step.attemptCount }}</p>
            <p v-if="step.errorMessage" class="error-text">失败原因：{{ step.errorMessage }}</p>
            <div v-if="step.status === 'failed'" class="actions">
              <button
                class="ghost-btn"
                :disabled="Boolean(props.stepActionPending)"
                @click="emit('retryStep', step.stepKey)"
              >
                {{ props.stepActionPending?.stepKey === step.stepKey && props.stepActionPending?.action === "retry" ? "重试中..." : "重新执行本环节" }}
              </button>
              <button
                class="ghost-btn"
                :disabled="Boolean(props.stepActionPending)"
                @click="emit('restartFromStep', step.stepKey)"
              >
                {{ props.stepActionPending?.stepKey === step.stepKey && props.stepActionPending?.action === "restart" ? "重跑中..." : "从本环节重新开始" }}
              </button>
              <button
                class="ghost-btn"
                :disabled="Boolean(props.stepActionPending)"
                @click="emit('skipStep', step.stepKey)"
              >
                {{ props.stepActionPending?.stepKey === step.stepKey && props.stepActionPending?.action === "skip" ? "跳过中..." : "跳过该素材" }}
              </button>
            </div>
          </article>
        </section>

        <section class="section">
          <h4>标题</h4>
          <p class="title">{{ article.title }}</p>
          <template v-if="shouldShowTitleCandidates">
            <h5>标题候选</h5>
            <ol v-if="article.titleCandidates?.length" class="list">
              <li v-for="(item, index) in article.titleCandidates" :key="`${index}-${item}`">{{ item }}</li>
            </ol>
            <p v-else class="muted">未生成标题候选</p>
          </template>
        </section>

        <section v-if="shouldShowCover" class="section">
          <h4>封面文案</h4>
          <p><strong>主文案：</strong>{{ article.coverText || "未生成" }}</p>
          <p><strong>副文案：</strong>{{ article.coverSubText || "未生成" }}</p>
          <p><strong>风格建议：</strong>{{ article.coverStyleSuggestion || "未生成" }}</p>
        </section>

        <section class="section">
          <h4>正文段落</h4>
          <article v-for="(paragraph, index) in article.paragraphs" :key="paragraph.paragraphId" class="paragraph-card">
            <div class="paragraph-head">
              <strong>段落 {{ index + 1 }}</strong>
              <button class="tiny-btn" @click="copyText(paragraph.text)">复制单段</button>
            </div>
            <p>{{ paragraph.text }}</p>
            <p v-if="paragraph.imagePlan?.caption"><strong>配图建议：</strong>{{ paragraph.imagePlan.caption }}</p>
          </article>
        </section>

        <section v-if="shouldShowImagePlan" class="section">
          <h4>配图计划</h4>
          <div v-for="(paragraph, index) in article.paragraphs" :key="`${paragraph.paragraphId}-plan`" class="plan-card">
            <strong>第 {{ index + 1 }} 段配图</strong>
            <p>类型：{{ paragraph.imagePlan?.type || "none" }}</p>
            <p>说明：{{ paragraph.imagePlan?.caption || "未提供" }}</p>
            <p>提示词：{{ paragraph.imagePlan?.prompt || "未提供" }}</p>
          </div>
        </section>

        <section class="section">
          <h4>风险提示与标签</h4>
          <p><strong>风险提示：</strong>{{ article.riskNotes?.join("；") || "无" }}</p>
          <p><strong>标签：</strong>{{ article.tags?.join("、") || "无" }}</p>
        </section>

        <section v-if="props.task?.tab === 'material' && props.task?.finalReview" class="section">
          <h4>终审报告</h4>
          <p><strong>结论：</strong>{{ props.task.finalReview.verdict }}</p>
          <p><strong>可发布：</strong>{{ props.task.finalReview.publishable ? "是" : "否" }}</p>
          <p><strong>原创度：</strong>{{ props.task.finalReview.originalityScore ?? "-" }}</p>
          <p><strong>爆款潜力：</strong>{{ props.task.finalReview.viralPotentialScore ?? "-" }}</p>
          <p><strong>相似度风险：</strong>{{ props.task.finalReview.similarityRisk || "-" }}</p>
          <p><strong>风险备注：</strong>{{ props.task.finalReview.riskNotes?.join("；") || "无" }}</p>
        </section>
      </template>
      <p v-else class="muted">暂无可展示结果。</p>
    </section>
  </aside>
</template>

<style scoped>
.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 67;
  display: flex;
  justify-content: flex-end;
  background: rgba(5, 10, 20, 0.5);
}

.drawer {
  width: min(760px, calc(100vw - 24px));
  height: 100%;
  padding: 18px;
  overflow: auto;
  background: #0e1626;
  border-left: 1px solid rgba(149, 181, 255, 0.16);
  display: grid;
  gap: 14px;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.drawer-header h3 {
  margin: 0;
}

.meta {
  margin: 4px 0 0;
  color: #9cb3d7;
  font-size: 12px;
}

.toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.close-btn,
.ghost-btn,
.tiny-btn {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(140, 173, 247, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: #eaf3ff;
  cursor: pointer;
}

.tiny-btn {
  min-height: 28px;
  font-size: 12px;
}

.section {
  border: 1px solid rgba(149, 181, 255, 0.14);
  border-radius: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.section h4,
.section h5 {
  margin: 0 0 8px;
}

.title {
  margin: 0;
  color: #edf5ff;
}

.list {
  margin: 0;
  padding-left: 18px;
}

.paragraph-card,
.plan-card,
.step-card {
  border: 1px solid rgba(149, 181, 255, 0.12);
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.step-card-failed {
  border-color: rgba(255, 122, 122, 0.5);
  background: rgba(255, 122, 122, 0.08);
}

.step-card-running {
  border-color: rgba(108, 174, 255, 0.5);
  background: rgba(108, 174, 255, 0.08);
}

.step-card-pending {
  border-color: rgba(200, 210, 230, 0.35);
}

.step-card-skipped {
  border-color: rgba(255, 196, 107, 0.5);
  background: rgba(255, 196, 107, 0.08);
}

.step-card-success {
  border-color: rgba(121, 240, 213, 0.5);
  background: rgba(121, 240, 213, 0.07);
}

.paragraph-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.muted {
  color: #9cb3d7;
}

.error-text {
  color: #ffb7b7;
  margin: 0;
}
</style>
