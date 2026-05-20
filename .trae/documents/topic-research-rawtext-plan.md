# 选题研究流程优化计划：中间环节不强制 JSON

## 背景

根据 GitHub Issue #5 的补充说明，当前 WebLLM 返回 JSON 不稳定（额外转义、残留协议片段、格式不一致等问题），需要调整选题研究流程：

**核心原则**：
- 中间环节（选题分析、素材研究计划、素材检索、素材合并、审稿意见等）优先使用自然文本/Markdown
- 只有最终文章输出才强制 JSON（`ContentStudioArticle`）

## 当前问题分析

### 现有代码中强制 JSON 的地方

1. **提示词层面** (`content-studio-prompts.ts`):
   - `buildTopicResearchPlanPrompt`: 要求 "输出严格 JSON"
   - `buildTopicResearchMaterialPrompt`: 要求 "输出严格 JSON"
   - `buildTopicMaterialMergePrompt`: 要求 "输出严格 JSON"

2. **解析层面** (`content-studio.service.ts`):
   - `parseTopicResearchPlan`: 使用 `parseOpenCliJson` 强制解析
   - `parseTopicResearchMaterialCard`: 使用 `parseOpenCliJson` 强制解析
   - `parseTopicMergedMaterial`: 使用 `parseOpenCliJson` 强制解析

3. **类型层面** (`content-studio.types.ts`):
   - 缺少 `rawText` 字段来保存原始输出
   - 缺少解析状态标记

## 实现步骤

### 步骤 1：扩展类型定义

**文件**: `src/main/types/content-studio.types.ts`

新增类型：
```typescript
export type TopicResearchStepOutput = {
  rawText: string;
  parsed?: unknown;
  parseStatus?: "not_required" | "success" | "failed";
  parseError?: string;
};

export type TopicResearchMaterialCardV2 = {
  materialId: string;
  query?: string;
  title?: string;
  sourceUrl?: string;
  sourceType?: string;
  confidence?: string;
  rawText: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  // 可选解析字段
  summary?: string;
  usablePoints?: string[];
  riskNotes?: string[];
};
```

修改现有类型，增加 `rawText` 字段：
- `TopicSelectedTopic` 增加 `rawText?: string`
- `TopicResearchPlanItem` 增加 `rawText?: string`
- `TopicMergedMaterial` 增加 `rawText?: string`

### 步骤 2：修改提示词

**文件**: `src/main/services/content-studio/content-studio-prompts.ts`

#### 2.1 修改 `buildTopicResearchPlanPrompt`

改为输出 Markdown 格式：
```
# 选题
标题：xxx
核心立意：xxx
适合平台：公众号
推荐理由：xxx

# 素材研究计划
1. materialId：m1
   query：xxx
   purpose：xxx
   preferredSourceType：official
   required：true
   riskNotes：xxx
```

#### 2.2 修改 `buildTopicResearchMaterialPrompt`

改为输出素材卡 Markdown：
```
# 素材卡 m1
query：xxx
标题：xxx
来源类型：official
来源链接：https://...
可信度：high

## 摘要
500字以内摘要...

## 可用观点
- xxx
- xxx

## 风险提醒
- xxx
```

#### 2.3 修改 `buildTopicMaterialMergePrompt`

改为输出 Markdown：
```
# 素材包合并

## 可确认事实
- xxx

## 用户/创作者问题
- xxx

## 争议点
- xxx

## 可用论点
- xxx

## 风险边界
- xxx

## 来源摘要
- m1：标题 / 来源链接 / 可信度
```

#### 2.4 保持最终文章提示词不变

`buildTopicDraftFromResearchPrompt` 和 `buildTopicFinalReviewPrompt` 仍然要求输出严格 JSON。

### 步骤 3：修改解析逻辑

**文件**: `src/main/services/content-studio/content-studio.service.ts`

#### 3.1 新增轻量解析函数

```typescript
private parseTopicResearchPlanFromMarkdown(
  raw: string,
  maxMaterialCount: number
): { selectedTopic: TopicSelectedTopic; researchPlan: TopicResearchPlanItem[]; rawText: string } {
  // 1. 保存原始文本
  // 2. 尝试从 Markdown 中提取关键字段
  // 3. 如果提取失败，使用默认值
  // 4. 不抛出异常，确保流程继续
}

private parseTopicResearchMaterialCardFromMarkdown(
  raw: string,
  item: TopicResearchPlanItem,
  maxWords: number
): TopicResearchMaterialCard {
  // 1. 保存 rawText
  // 2. 尝试提取字段，失败则使用默认值
  // 3. 不抛出异常
}

private parseTopicMergedMaterialFromMarkdown(
  raw: string,
  fallbackTopic: string,
  cards: TopicResearchMaterialCard[]
): TopicMergedMaterial {
  // 1. 保存 rawText
  // 2. 尝试提取字段
  // 3. 不抛出异常
}
```

#### 3.2 修改现有解析函数

- 先尝试 JSON 解析
- 如果失败，回退到 Markdown 解析
- 始终保存 rawText

### 步骤 4：修改流程执行逻辑

**文件**: `src/main/services/content-studio/content-studio.service.ts`

在 `runTopicCreateWithResearch` 方法中：

1. **选题与研究计划步骤**：
   - 保存 rawText 到 `selectedTopic.rawText`
   - 解析失败时使用默认值，不中断流程

2. **素材检索步骤**：
   - 每条素材保存 rawText
   - 解析失败时标记 `parseStatus: "failed"`，但 `status: "success"`
   - 不因解析失败而中断流程

3. **素材合并步骤**：
   - 保存 rawText 到 `mergedMaterial.rawText`
   - 解析失败时使用空数组

4. **最终文章生成**：
   - 保持强制 JSON 解析
   - 解析失败时抛出异常

### 步骤 5：更新前端展示（可选）

前端在展示中间步骤结果时：
- 优先展示 rawText（Markdown 渲染）
- 如果有解析成功的结构化数据，可以额外展示

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/main/types/content-studio.types.ts` | 新增 `rawText` 字段，新增 `TopicResearchStepOutput` 类型 |
| `src/main/services/content-studio/content-studio-prompts.ts` | 修改中间环节提示词，允许 Markdown 输出 |
| `src/main/services/content-studio/content-studio.service.ts` | 新增 Markdown 解析函数，修改现有解析逻辑 |

## 验收标准

1. ✅ 选题研究计划步骤不再因 JSON 解析失败而中断
2. ✅ 素材检索步骤保存 rawText，解析失败不影响流程继续
3. ✅ 素材合并步骤保存 rawText
4. ✅ 最终文章输出仍然强制 JSON
5. ✅ 前端可以查看中间步骤的 rawText
6. ✅ 断点续跑功能正常工作

## 风险与注意事项

1. **向后兼容**：现有的 `TopicResearchMaterialCard` 等类型已有使用，新增字段应为可选
2. **解析容错**：Markdown 解析应足够宽松，不因格式问题中断
3. **测试覆盖**：需要测试各种输出格式（JSON、Markdown、混合格式）的解析情况
