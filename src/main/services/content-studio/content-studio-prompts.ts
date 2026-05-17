import type { TopicCreateInput } from "../../types/content-studio.types";

function boolLabel(value: boolean | undefined, whenTrue: string, whenFalse: string): string {
  return value ? whenTrue : whenFalse;
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
    lines.push(
      "用户已开启配图计划：请尽量为每段输出 imagePlan，结构为 {type,prompt?,caption?}，type 仅允许 source_image|ai_generated|infographic|none。"
    );
  } else {
    lines.push("用户关闭配图计划：不要输出 imagePlan 字段。");
  }

  return lines.join("\n");
}

function buildTopicContext(input: TopicCreateInput): string {
  return [
    `话题：${input.topic}`,
    `平台：${input.platform}`,
    `文章类型：${input.articleType}`,
    `目标读者：${input.targetReader?.trim() || "未指定"}`,
    `写作风格：${input.writingStyle?.trim() || "未指定"}`,
    `字数范围：${input.wordRange?.trim() || "未指定"}`,
    `生成标题候选：${boolLabel(input.generateTitleCandidates, "是", "否")}`,
    `生成封面文案：${boolLabel(input.generateCoverText, "是", "否")}`,
    `生成配图计划：${boolLabel(input.generateImagePlan, "是", "否")}`
  ].join("\n");
}

export function buildTopicPlanPrompt(input: TopicCreateInput): string {
  return [
    "你是内容创作工作台中的模型A，角色是选题策划编辑。",
    "目标：根据用户输入给出可执行的文章方向，并产出第一版完整文章 JSON。",
    buildTopicOutputSchemaNotice(input),
    "要求：",
    "1. 段落不少于5段，结构完整，有开头钩子、主体分析、结尾观点。",
    "2. 所有观点要有事实边界，不夸大、不造数据。",
    "3. paragraphId 依次使用 p1/p2/p3...",
    "用户输入：",
    buildTopicContext(input)
  ].join("\n\n");
}

export function buildTopicReviewPrompt(input: TopicCreateInput, planJson: string): string {
  return [
    "你是内容创作工作台中的模型B，角色是反方审稿总编。",
    "任务：审查模型A输出草稿，重点找出逻辑漏洞、事实风险、平台不匹配、标题钩子不足。",
    "只输出 JSON，不要输出 Markdown，不要解释。",
    "输出字段：{ verdict: \"pass|revise\", mustFix: string[], niceToHave: string[], riskNotes: string[] }",
    "用户输入：",
    buildTopicContext(input),
    "模型A草稿JSON：",
    planJson
  ].join("\n\n");
}

export function buildTopicRewritePrompt(input: TopicCreateInput, planJson: string, reviewJson: string): string {
  return [
    "你是内容创作工作台中的模型A，请根据模型B审稿意见重写并给出改进版。",
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

export function buildTopicFinalReviewPrompt(input: TopicCreateInput, rewrittenJson: string): string {
  return [
    "你是内容创作工作台中的模型B，请做终审并输出最终可发布版本。",
    buildTopicOutputSchemaNotice(input),
    "如果存在风险，请在 riskNotes 中明确给出。",
    "用户输入：",
    buildTopicContext(input),
    "待终审JSON：",
    rewrittenJson
  ].join("\n\n");
}
