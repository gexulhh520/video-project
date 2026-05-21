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
    "基础字段固定包含：title、paragraphs、tags。",
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
    let imagePlanLine = "用户已开启配图计划：必须为每段输出 imagePlan 字段，结构为 {type,prompt,caption}，type 仅允许 source_image|ai_generated|infographic|none。";
    if (input.imagePlanRequirements) {
      imagePlanLine += ` 配图要求：${input.imagePlanRequirements}`;
    }
    lines.push(imagePlanLine);
  } else {
    lines.push("用户关闭配图计划：不要输出 imagePlan 字段。");
  }

  if (input.requireRiskNotes) {
    lines.push("用户要求输出风险提醒：必须输出 riskNotes 字段，值为字符串数组，例如 [\"风险1\", \"风险2\"]，不要输出单个字符串。");
  } else {
    lines.push("用户关闭风险提醒：不要输出 riskNotes 字段。");
  }

  lines.push("回复必须以 { 开头，以 } 结尾。");
  lines.push("不要把 JSON 当成字符串输出。");
  lines.push("不要对 [ ] _ 进行反斜杠转义。");
  lines.push("数组必须直接写成 []，不能写成 \\[ \\]。");
  lines.push("字段值 source_image、ai_generated、infographic、none 必须原样输出，不能写成 source\\_image 或 ai\\_generated。");

  return lines.join("\n");
}

function buildTopicContext(input: TopicCreateInput): string {
  const imagePlanLine = input.generateImagePlan
    ? `生成配图计划：是${input.imagePlanRequirements ? `（配图要求：${input.imagePlanRequirements}）` : ""}`
    : `生成配图计划：否`;
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
    imagePlanLine
  ].join("\n");
}

export function buildTopicPlanPrompt(input: TopicCreateInput, roles?: TopicPromptRoles): string {
  const modelARole = resolveRoleName(roles?.modelARoleName, "选题策划编辑");
  return [
    `你是内容创作工作台中的模型A，角色是${modelARole}。`,
    "目标：根据用户输入给出可执行的文章方向，并产出第一版完整文章 JSON。",
    buildTopicOutputSchemaNotice(input),
    "要求：",
    "1. 标题简短但是必须吸引人点击",
    "2. 段落不少于 3 段，结构完整，开头必须会引起用户点击，非常强烈的点击欲望、主体分析、结尾观点。",

    // "2. 所有观点要有事实边界，不夸大、不造数据。",
    "3. paragraphId 依次使用 p1/p2/p3...",
    "用户输入：",
    buildTopicContext(input)
  ].join("\n\n");
}

export function buildTopicReviewPrompt(input: TopicCreateInput, planJson: string, roles?: TopicPromptRoles): string {
  const modelBRole = resolveRoleName(roles?.modelBRoleName, "反方审稿总编");
  return [
    `你是内容创作工作台中的模型B，角色是${modelBRole}。`,
    "任务：审查模型A输出草稿，重点提出爆款内容修改建议,严格围绕用户要求。",
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
    `你是模型A，角色是${role}。请分析原始素材并给出详细的分析报告。`,
    "请使用 Markdown 格式输出，结构如下：",
    "",
    "# 素材分析报告",
    "",
    "## 原始主题",
    "素材主要讲述的核心内容...",
    "",
    "## 核心要点",
    "素材中的关键观点和事实（列出要点）",
    "",
    "## 结构分析",
    "素材的组织结构和逻辑框架...",
    "",
    "## 重写风险",
    "直接重写可能遇到的问题和风险点...",
    "",
    "## 可借鉴角度",
    "适合二创的切入点和创新方向...",
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
    `你是模型B，角色是${role}。请评审 5 个选题并给出详细的评审意见。`,
    "请使用 Markdown 格式输出，结构如下：",
    "",
    "# 选题评审报告",
    "",
    "## 整体评价",
    "对5个选题的总体质量评估...",
    "",
    "## 排名建议",
    "按优劣顺序排列5个选题，并说明理由",
    "",
    "## 详细点评",
    "### 选题1标题",
    "优点：...",
    "缺点：...",
    "改进建议：...",
    "### 选题2标题",
    "...",
    "",
    "## 最佳推荐",
    "最适合深入创作的选题及理由...",
    "",
    "## 风险提示",
    "需要避免的选题及原因...",
    "",
    "## 修改建议",
    "给模型A的具体优化建议...",
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
    `你是模型B，角色是${role}。请评审文章并给出详细的审稿意见。`,
    "请使用 Markdown 格式输出，结构如下：",
    "",
    "# 文章审稿报告",
    "",
    "## 总体评价",
    "对文章质量的总体判断...",
    "",
    "## 原创性评估",
    "文章的原创程度和相似度风险分析...",
    "",
    "## 爆款潜力",
    "文章吸引读者点击和传播的潜力评估...",
    "",
    "## 内容深度",
    "观点的深度和论证的充分性评估...",
    "",
    "## 平台适配",
    "是否符合目标平台风格...",
    "",
    "## 必须修改",
    "需要强制修复的问题列表：",
    "- 问题1：...",
    "- 问题2：...",
    "",
    "## 建议优化",
    "可以改进的地方：",
    "- 优化点1：...",
    "- 优化点2：...",
    "",
    "## 风险提示",
    "潜在的风险点：",
    "- 风险1：...",
    "- 风险2：...",
    "",
    "## 修改指导",
    "给模型A的具体修改建议...",
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
    `你是模型B，角色是${role}。请做最终验收并给出详细的验收报告。`,
    "请使用 Markdown 格式输出，结构如下：",
    "",
    "# 最终验收报告",
    "",
    "## 验收结论",
    "是否通过验收（通过/不通过）",
    "",
    "## 可发布性",
    "文章是否可以直接发布...",
    "",
    "## 原创性评分",
    "对文章原创程度的评估（可给出1-10分评分）...",
    "",
    "## 相似度风险",
    "与原始素材或其他内容的相似度评估（低/中/高风险）...",
    "",
    "## 爆款潜力",
    "文章的传播潜力评估（可给出1-10分评分）...",
    "",
    "## 风险提示",
    "发布前需要注意的风险点：",
    "- 风险1：...",
    "- 风险2：...",
    "",
    "## 最终建议",
    "是否建议发布及优化建议...",
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
    "- 严格按用户输入的选题进行研究",
    "- 每条素材必须有明确的 purpose",
    "- preferredSourceType 任何来源",
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
  const requireRiskNotes = Boolean(input.requireRiskNotes);
  const requireSourceUrl = Boolean(input.requireSourceUrl);
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
