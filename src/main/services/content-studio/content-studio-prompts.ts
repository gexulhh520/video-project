import type { TopicCreateInput } from "../../types/content-studio.types";

function boolLabel(value: boolean | undefined, whenTrue: string, whenFalse: string): string {
  return value ? whenTrue : whenFalse;
}

export function buildTopicPlanPrompt(input: TopicCreateInput): string {
  return [
    "你是内容创作工作台中的模型A，角色是选题策划编辑。",
    "目标：根据用户输入给出可执行的文章方向与正文初稿。",
    "请使用中文输出 JSON，不要输出 Markdown 代码块，不要解释。",
    "输出字段：",
    "{",
    '  "title": "文章标题",',
    '  "coverText": "封面文案（可空字符串）",',
    '  "paragraphs": [{ "paragraphId": "p1", "text": "段落内容", "imagePlan": { "type": "real|ai|infographic|screenshot|none", "description": "配图说明", "aiPrompt": "可选" } }],',
    '  "tags": ["标签1", "标签2"],',
    '  "riskNotes": ["风险提示1"]',
    "}",
    "要求：",
    "1. 段落不少于5段，结构完整。",
    "2. 所有观点要有合理边界，不夸大、不造数据。",
    "3. imagePlan 必须给出，新闻财经类优先 infographic/screenshot。",
    "4. paragraphId 依次使用 p1/p2/p3...",
    "用户输入：",
    `话题：${input.topic}`,
    `平台：${input.platform}`,
    `文章类型：${input.articleType}`,
    `目标读者：${input.targetReader?.trim() || "未指定"}`,
    `文章风格：${input.writingStyle?.trim() || "未指定"}`,
    `字数范围：${input.wordRange?.trim() || "未指定"}`,
    `生成标题候选：${boolLabel(input.generateTitleCandidates, "是", "否")}`,
    `生成封面文案：${boolLabel(input.generateCoverText, "是", "否")}`,
    `生成配图计划：${boolLabel(input.generateImagePlan, "是", "否")}`
  ].join("\n");
}

export function buildTopicReviewPrompt(input: TopicCreateInput, planJson: string): string {
  return [
    "你是内容创作工作台中的模型B，角色是反方审稿总编。",
    "请审查模型A输出的草稿，重点挑刺：逻辑漏洞、事实风险、标题钩子不足、平台适配问题。",
    "只输出 JSON，不要输出 Markdown，不要输出解释。",
    "输出字段：",
    "{",
    '  "verdict": "pass|revise",',
    '  "mustFix": ["必须修改点1"],',
    '  "niceToHave": ["可优化点1"],',
    '  "riskNotes": ["风险提示"]',
    "}",
    "用户输入：",
    `话题：${input.topic}`,
    `平台：${input.platform}`,
    `文章类型：${input.articleType}`,
    "模型A草稿JSON：",
    planJson
  ].join("\n");
}

export function buildTopicRewritePrompt(input: TopicCreateInput, planJson: string, reviewJson: string): string {
  return [
    "你是内容创作工作台中的模型A，请根据模型B审稿意见重写并给出最终文章。",
    "输出要求：只输出 JSON，不要解释，不要 Markdown。",
    "输出 JSON 结构与首次草稿一致：title/coverText/paragraphs/tags/riskNotes。",
    "重写时优先修复 mustFix，且保留可读性与平台风格。",
    "用户输入：",
    `话题：${input.topic}`,
    `平台：${input.platform}`,
    `文章类型：${input.articleType}`,
    "初稿JSON：",
    planJson,
    "审稿意见JSON：",
    reviewJson
  ].join("\n");
}

export function buildTopicFinalReviewPrompt(input: TopicCreateInput, rewrittenJson: string): string {
  return [
    "你是内容创作工作台中的模型B，请做终审并输出可发布版本。",
    "如果可发布，直接输出最终 JSON；如果存在问题，也请在 riskNotes 中写出并尽量修复。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "输出结构：title/coverText/paragraphs/tags/riskNotes。",
    "用户输入：",
    `话题：${input.topic}`,
    `平台：${input.platform}`,
    `文章类型：${input.articleType}`,
    "待终审JSON：",
    rewrittenJson
  ].join("\n");
}
