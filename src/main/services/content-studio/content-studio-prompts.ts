import type {
  ContentStudioMaterialPack,
  MaterialRewriteInput,
  TopicCreateInput,
  TopicMergedMaterial,
  TopicResearchMaterialCard,
  TopicResearchPlanItem,
  TopicSelectedTopic
} from "../../types/content-studio.types";


type TopicPromptRoles = {
  modelARoleName?: string;
  modelBRoleName?: string;
};

function boolLabel(value: boolean | undefined, whenTrue: string, whenFalse: string): string {
  return value ? whenTrue : whenFalse;
}

function resolveRoleName(roleName: string | undefined, fallback: string): string {
  const value = String(roleName || "").trim();
  return value || fallback;
}

function buildTopicOutputSchemaNotice(input: TopicCreateInput): string {
  const lines: string[] = [
    "你必须输出严格合法 JSON，不要输出 Markdown 代码块，不要解释。",
    "整个回复只能包含一个最终版 JSON 对象，不要先输出草稿 JSON 再修正。",
    "基础字段固定包含：title、paragraphs、tags、riskNotes。",
    "paragraphs 每项必须包含 paragraphId、text。"
  ];

  if (input.generateTitleCandidates) {
    lines.push("用户已开启标题候选：必须输出 titleCandidates，数量 3-5 个。");
  } else {
    lines.push("用户关闭标题候选：不要输出 titleCandidates 字段。");
  }

  if (input.generateCoverText) {
    lines.push("用户已开启封面文案：必须输出 coverText、coverSubText、coverStyleSuggestion。");
  } else {
    lines.push("用户关闭封面文案：不要输出 coverText、coverSubText、coverStyleSuggestion 字段。");
  }

  if (input.generateImagePlan) {
    lines.push("用户已开启配图计划：尽量为每段输出 imagePlan，结构为 {type,prompt?,caption?}，type 仅允许 source_image|ai_generated|infographic|none。");
  } else {
    lines.push("用户关闭配图计划：不要输出 imagePlan 字段。");
  }

  lines.push("回复必须以 { 开头，以 } 结尾。");
  lines.push("不要把 JSON 当成字符串输出。");
  lines.push("不要对 [ ] _ 进行反斜杠转义。");
  lines.push("数组必须直接写成 []，不能写成 \\[ \\]。");
  lines.push("字段值 source_image、ai_generated、infographic、none 必须原样输出，不能写成 source\\_image 或 ai\\_generated。");
  lines.push("riskNotes 必须输出字符串数组，例如 [\"风险1\", \"风险2\"]，不要输出单个字符串。");

  return lines.join("\n");
}

function buildTopicContext(input: TopicCreateInput): string {
  return [
    `话题：${input.topic}`,
    `平台：${input.platform}`,
    `文章类型：${input.articleType}`,
    `审稿轮次：${input.reviewRounds ?? 2}`,
    `目标读者：${input.targetReader?.trim() || "未指定"}`,
    `写作风格：${input.writingStyle?.trim() || "未指定"}`,
    `字数范围：${input.wordRange?.trim() || "未指定"}`,
    `生成标题候选：${boolLabel(input.generateTitleCandidates, "是", "否")}`,
    `生成封面文案：${boolLabel(input.generateCoverText, "是", "否")}`,
    `生成配图计划：${boolLabel(input.generateImagePlan, "是", "否")}`
  ].join("\n");
}

export function buildTopicPlanPrompt(input: TopicCreateInput, roles?: TopicPromptRoles): string {
  const modelARole = resolveRoleName(roles?.modelARoleName, "选题策划编辑");
  return [
    `你是内容创作工作台中的模型A，角色是${modelARole}。`,
    "目标：根据用户输入给出可执行的文章方向，并产出第一版完整文章 JSON。",
    buildTopicOutputSchemaNotice(input),
    "要求：",
    "1. 段落不少于 3 段，结构完整，有开头钩子、主体分析、结尾观点。",
    "2. 所有观点要有事实边界，不夸大、不造数据。",
    "3. paragraphId 依次使用 p1/p2/p3...",
    "用户输入：",
    buildTopicContext(input)
  ].join("\n\n");
}

export function buildTopicReviewPrompt(input: TopicCreateInput, planJson: string, roles?: TopicPromptRoles): string {
  const modelBRole = resolveRoleName(roles?.modelBRoleName, "反方审稿总编");
  return [
    `你是内容创作工作台中的模型B，角色是${modelBRole}。`,
    "任务：审查模型A输出草稿，重点找出逻辑漏洞、事实风险、平台不匹配、标题钩子不足。",
    "只输出 JSON，不要输出 Markdown，不要解释。",
    "输出字段：{ verdict: \"pass|revise\", mustFix: string[], niceToHave: string[], riskNotes: string[] }",
    "用户输入：",
    buildTopicContext(input),
    "模型A草稿JSON：",
    planJson
  ].join("\n\n");
}

export function buildTopicRewritePrompt(
  input: TopicCreateInput,
  planJson: string,
  reviewJson: string,
  roles?: TopicPromptRoles
): string {
  const modelARole = resolveRoleName(roles?.modelARoleName, "选题策划编辑");
  const modelBRole = resolveRoleName(roles?.modelBRoleName, "反方审稿总编");
  return [
    `你是内容创作工作台中的模型A，角色是${modelARole}。请根据模型B（${modelBRole}）审稿意见重写并给出改进版。`,
    buildTopicOutputSchemaNotice(input),
    "重写要求：优先修复 mustFix，并确保可读性与平台风格。",
    "用户输入：",
    buildTopicContext(input),
    "初稿JSON：",
    planJson,
    "审稿意见JSON：",
    reviewJson
  ].join("\n\n");
}

export function buildTopicFinalReviewPrompt(
  input: TopicCreateInput,
  rewrittenJson: string,
  roles?: TopicPromptRoles
): string {
  const modelARole = resolveRoleName(roles?.modelARoleName, "选题策划编辑");
  const modelBRole = resolveRoleName(roles?.modelBRoleName, "反方审稿总编");
  return [
    `你是内容创作工作台中的模型B，角色是${modelBRole}。请对模型A（${modelARole}）重写稿做终审并输出最终可发布版本。`,
    buildTopicOutputSchemaNotice(input),
    "如果存在风险，请在 riskNotes 中明确给出。",
    "用户输入：",
    buildTopicContext(input),
    "待终审JSON：",
    rewrittenJson
  ].join("\n\n");
}

function buildMaterialContext(input: MaterialRewriteInput): string {
  return [
    `平台：${input.platform}`,
    `文章类型：${input.articleType}`,
    `目标读者：${input.targetReader?.trim() || "未指定"}`,
    `写作风格：${input.writingStyle?.trim() || "未指定"}`,
    `字数范围：${input.wordRange?.trim() || "未指定"}`,
    `生成标题候选：${boolLabel(input.generateTitleCandidates, "是", "否")}`,
    `生成封面文案：${boolLabel(input.generateCoverText, "是", "否")}`,
    `生成配图计划：${boolLabel(input.generateImagePlan, "是", "否")}`,
    `选题评审轮次：${input.topicReviewRounds ?? 2}`,
    `正文评审轮次：${input.articleReviewRounds ?? 2}`
  ].join("\n");
}

function buildMaterialSourceDigest(materialPack: ContentStudioMaterialPack): string {
  const maxCharsPerSource = 6000;
  return materialPack.sources
    .map((source, index) => {
      const body = source.body.replace(/\s+/g, " ").slice(0, maxCharsPerSource);
      return [
        `素材 ${index + 1}`,
        `sourceId: ${source.sourceId}`,
        `type: ${source.type}`,
        `title: ${source.title || "无"}`,
        `url: ${source.url || "无"}`,
        `body: ${body}`,
        `images: ${(source.images || []).length}`
      ].join("\n");
    })
    .join("\n\n");
}

export function buildMaterialSourceAnalysisPrompt(
  input: MaterialRewriteInput,
  materialPack: ContentStudioMaterialPack,
  roleName?: string
): string {
  const role = resolveRoleName(roleName, "素材重组编辑");
  return [
    `你是模型A，角色是${role}。请分析原始素材并输出 JSON。`,
    "输出字段：sourceAnalysis，包含 originalTheme/originalMainPoints/originalStructure/rewriteRisk。",
    "只输出 JSON，不要 markdown。",
    buildMaterialContext(input),
    buildMaterialSourceDigest(materialPack)
  ].join("\n\n");
}

export function buildMaterialTopicGeneratePrompt(
  input: MaterialRewriteInput,
  materialPack: ContentStudioMaterialPack,
  sourceAnalysisJson: string,
  roleName?: string
): string {
  const role = resolveRoleName(roleName, "素材重组编辑");
  return [
    `你是模型A，角色是${role}。基于 sourceAnalysis 生成 5 个不同新选题。`,
    "输出字段：newTopicAngles（固定 5 个），每个含 topicId/title/coreAngle/coreThesis/readerPainPoint/hook/valuePromise/articleStructure/differenceFromOriginal/viralPotential/riskNotes。",
    "只输出 JSON，不要 markdown。",
    buildMaterialContext(input),
    buildMaterialSourceDigest(materialPack),
    sourceAnalysisJson
  ].join("\n\n");
}

export function buildMaterialTopicReviewPrompt(
  input: MaterialRewriteInput,
  sourceAnalysisJson: string,
  topicJson: string,
  roleName?: string
): string {
  const role = resolveRoleName(roleName, "相似度与事实审稿人");
  return [
    `你是模型B，角色是${role}。请评审 5 个选题并给出排名与修改建议。`,
    "输出字段：overallVerdict/ranking/detailedReview/bestTopicRecommendation/topicsToAvoid/finalSuggestionsForModelA。",
    "只输出 JSON，不要 markdown。",
    buildMaterialContext(input),
    sourceAnalysisJson,
    topicJson
  ].join("\n\n");
}

export function buildMaterialTopicRewritePrompt(
  input: MaterialRewriteInput,
  topicJson: string,
  topicReviewJson: string,
  roleName?: string
): string {
  const role = resolveRoleName(roleName, "素材重组编辑");
  return [
    `你是模型A，角色是${role}。请根据模型B建议优化 5 个选题。`,
    "保持 topicId 不变，输出 newTopicAngles 数量必须仍为 5。",
    "只输出 JSON，不要 markdown。",
    buildMaterialContext(input),
    topicJson,
    topicReviewJson
  ].join("\n\n");
}

export function buildMaterialFinalTopicDecisionPrompt(
  input: MaterialRewriteInput,
  optimizedTopicJson: string,
  roleName?: string
): string {
  const role = resolveRoleName(roleName, "相似度与事实审稿人");
  return [
    `你是模型B，角色是${role}。请最终只选 1 个最佳选题。`,
    "输出字段：bestTopicRecommendation（selectedTopicId/selectedTitle/reason/suggestedNewTitle/suggestedCoreThesis/suggestedArticleDirection）。",
    "只输出 JSON，不要 markdown。",
    buildMaterialContext(input),
    optimizedTopicJson
  ].join("\n\n");
}

export function buildMaterialArticleDraftPrompt(
  input: MaterialRewriteInput,
  materialPack: ContentStudioMaterialPack,
  finalTopicJson: string,
  roleName?: string
): string {
  const role = resolveRoleName(roleName, "素材重组编辑");
  const imagePlanRule = input.generateImagePlan
    ? "开启了配图计划：段落尽量输出 imagePlan，type 仅允许 source_image|ai_generated|infographic|none。"
    : "关闭了配图计划：不要输出 imagePlan。";
  return [
    `你是模型A，角色是${role}。请基于最终选题写完整原创文章 JSON。`,
    "输出结构：title/titleCandidates?/coverText?/coverSubText?/coverStyleSuggestion?/paragraphs/tags?/riskNotes?。",
    imagePlanRule,
    "只输出 JSON，不要 markdown。",
    buildMaterialContext(input),
    buildMaterialSourceDigest(materialPack),
    finalTopicJson
  ].join("\n\n");
}

export function buildMaterialArticleReviewPrompt(
  input: MaterialRewriteInput,
  materialPack: ContentStudioMaterialPack,
  draftJson: string,
  roleName?: string
): string {
  const role = resolveRoleName(roleName, "相似度与事实审稿人");
  return [
    `你是模型B，角色是${role}。请评审文章并输出可执行修改意见。`,
    "输出字段：verdict/publishable/originalityScore/similarityRisk/viralPotentialScore/contentDepthScore/platformFitScore/wordCountFitScore/styleFitScore/imagePlanFitScore/mustFix/niceToHave/riskNotes/revisionInstructionForA。",
    "只输出 JSON，不要 markdown。",
    buildMaterialContext(input),
    buildMaterialSourceDigest(materialPack),
    draftJson
  ].join("\n\n");
}

export function buildMaterialArticleRewritePrompt(
  input: MaterialRewriteInput,
  materialPack: ContentStudioMaterialPack,
  draftJson: string,
  reviewJson: string,
  roleName?: string
): string {
  const role = resolveRoleName(roleName, "素材重组编辑");
  return [
    `你是模型A，角色是${role}。请根据模型B审稿意见重写文章 JSON。`,
    "必须优先修复 mustFix，保留可发布结构。",
    "只输出 JSON，不要 markdown。",
    buildMaterialContext(input),
    buildMaterialSourceDigest(materialPack),
    draftJson,
    reviewJson
  ].join("\n\n");
}

export function buildMaterialFinalReviewPrompt(
  input: MaterialRewriteInput,
  materialPack: ContentStudioMaterialPack,
  finalArticleJson: string,
  roleName?: string
): string {
  const role = resolveRoleName(roleName, "相似度与事实审稿人");
  return [
    `你是模型B，角色是${role}。请做最终验收并输出 JSON。`,
    "输出字段：verdict/publishable/originalityScore/similarityRisk/viralPotentialScore/riskNotes。",
    "只输出 JSON，不要 markdown。",
    buildMaterialContext(input),
    buildMaterialSourceDigest(materialPack),
    finalArticleJson
  ].join("\n\n");
}


export function buildTopicResearchPlanPrompt(input: TopicCreateInput, roles?: TopicPromptRoles): string {
  const modelARole = resolveRoleName(roles?.modelARoleName, "选题策划编辑");
  const maxMaterialCount = Math.min(10, Math.max(1, Number(input.maxMaterialCount || 5)));
  return [
    `你是内容创作工作台中的模型A，角色是${modelARole}。`,
    "先做选题研究，不要直接写文章。",
    "请使用严格的 JSON 格式输出，不要输出 Markdown。",
    "",
    "输出字段：",
    "- selectedTopic: { title, coreThesis, contentType, targetPlatform, reason }",
    "- researchPlan: 数组，每个元素包含 { materialId, query, purpose, preferredSourceType, required }",
    "- researchPlan 条数不超过 ${maxMaterialCount} 条",
    "",
    "preferredSourceType 可选值：official|media|community|case|industry|other",
    "",
    "要求：",
    "- 每条素材必须有明确的 purpose",
    "- preferredSourceType 优先选择官方来源、媒体报道、行业讨论等",
    "",
    "用户输入：",
    buildTopicContext(input)
  ].join("\n");
}

export function buildTopicResearchMaterialPrompt(
  input: TopicCreateInput,
  selectedTopic: TopicSelectedTopic,
  planItem: TopicResearchPlanItem,
  priorCards: TopicResearchMaterialCard[]
): string {
  const maxWords = Math.min(2000, Math.max(100, Number(input.materialSummaryMaxWords || 500)));
  const requireRiskNotes = input.requireRiskNotes !== false;
  const requireSourceUrl = input.requireSourceUrl !== false;
  return [
    "你现在执行单条素材检索与总结。",
    "你可以先检索公开网页，再输出素材卡。",
    "请使用 Markdown 格式输出，不要输出 JSON。",
    "",
    "输出格式示例：",
    `# 素材卡 ${planItem.materialId}`,
    "query：本次查找的问题或关键词",
    "标题：素材标题",
    "来源类型：official|media|community|case|industry|other",
    "来源链接：https://...",
    "可信度：high|medium|low",
    "",
    "## 摘要",
    `${maxWords} 字以内的摘要内容...`,
    "",
    "## 可用观点",
    "- 观点1",
    "- 观点2",
    "",
    "## 风险提醒",
    requireRiskNotes ? "- 至少列出1条风险提醒（如无风险可写'暂无明显风险'）" : "- 可选",
    "",
    "要求：",
    "- 如果没找到可靠素材，不要编造，可信度设为 low，并在风险提醒中说明原因",
    `- 来源链接${requireSourceUrl ? "必须提供有效链接" : "可为空"}`,
    "- 区分官方信息、媒体报道、用户反馈、个人观点",
    "- 用户反馈不能当成官方结论",
    "",
    `选题：${JSON.stringify(selectedTopic)}`,
    `当前计划项：${JSON.stringify(planItem)}`,
    `已完成素材卡（供去重与避免重复）：${JSON.stringify(priorCards.map(c => c.materialId))}`
  ].join("\n");
}

export function buildTopicMaterialMergePrompt(
  input: TopicCreateInput,
  selectedTopic: TopicSelectedTopic,
  cards: TopicResearchMaterialCard[]
): string {
  return [
    "请基于已收集素材卡合并素材包。",
    "请使用 Markdown 格式输出，不要输出 JSON。",
    "",
    "输出格式示例：",
    "# 素材包合并",
    "",
    "## 可确认事实",
    "- 事实1",
    "- 事实2",
    "",
    "## 用户/创作者问题",
    "- 问题1",
    "",
    "## 争议点",
    "- 争议1",
    "",
    "## 内容市场缺口",
    "- 缺口1",
    "",
    "## 可用论点",
    "- 论点1",
    "",
    "## 风险边界",
    "- 不能直接断言的内容",
    "",
    "## 来源摘要",
    "- m1：标题 / 来源链接 / 可信度",
    "",
    "要求：不要新增未在素材卡中出现的事实。",
    "",
    `用户输入：${buildTopicContext(input)}`,
    `选题：${JSON.stringify(selectedTopic)}`,
    `素材卡：${JSON.stringify(cards.map(c => ({ materialId: c.materialId, title: c.title, rawText: c.rawText })))}`
  ].join("\n");
}

export function buildTopicDraftFromResearchPrompt(
  input: TopicCreateInput,
  selectedTopic: TopicSelectedTopic,
  mergedMaterial: TopicMergedMaterial,
  roles?: TopicPromptRoles
): string {
  const modelARole = resolveRoleName(roles?.modelARoleName, "选题策划编辑");
  return [
    `你是内容创作工作台中的模型A，角色是${modelARole}。`,
    "基于选题和素材包生成文章初稿。",
    buildTopicOutputSchemaNotice(input),
    "约束：不能把用户反馈写成官方结论；不能把推测写成确定事实；不能编造平台规则。",
    "用户输入：",
    buildTopicContext(input),
    `最终选题：${JSON.stringify(selectedTopic)}`,
    `素材包：${JSON.stringify(mergedMaterial)}`
  ].join("\n\n");
}
