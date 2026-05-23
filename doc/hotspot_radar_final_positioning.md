# 热点雷达最终定位（P0/P1 实施说明）

## 1. 产品定位

热点雷达是一个**基于账号画像、平台采集配置和 LLM Web 判断的热点筛选系统**。

它的目标不是告诉用户“今天热搜第一是什么”，而是：

1. 按账号配置主动采集多个平台热点。
2. 根据账号画像判断热点是否匹配。
3. 为匹配热点生成推荐话题。
4. 保存标题、摘要、URL、正文、来源和判断结果。
5. 把可用热点送入“话题成文 / 素材二创”下游。

---

## 2. 端到端流程

```text
账号画像
  ↓
热点平台配置
  ↓
关键词配置
  ↓
定时任务 / 手动任务触发
  ↓
OpenCLI 列表型命令采集（hot/search/news/ranking/trending/top/latest/feed/today/...）
  ↓
按日期、任务编号、平台命令保存 raw JSON
  ↓
LLM Web 标准化 raw JSON
  ↓
程序按最近 15 天 title / url 去重
  ↓
保存 candidate JSON
  ↓
LLM Web 第一层批量粗筛
  ↓
LLM Web 第二层单条精筛
  ↓
保存最终热点 JSON
  ↓
更新索引
  ↓
前端展示推荐热点
  ↓
下游：话题成文 / 素材二创
```

---

## 3. 本版边界（明确不做）

- 采集阶段不补全文。
- 采集阶段不调用详情命令。
- 不调用 `post/article/note/question/comments/download/detail` 等详情类命令。
- 不保存 Markdown 分析报告。
- 不保存原始素材包。
- 不做文章写作、审稿、发布。
- 不使用数据库，全部本地文件。

采集阶段只做：**调用 OpenCLI → 获取 JSON → 保存 raw 文件**。

---

## 4. 数据模型（核心）

### 4.1 账号画像（account）

保存账号定位、风格、主话题、受众、避开话题、启用状态等字段。

### 4.2 监听器（watcher）

一个账号可配置多个监听器（如“AI 工具热点”“科技大佬热点”）。

监听器包含：

- `sources`：平台 + 命令 + limit
- `keywords`：关键词数组
- `runIntervalMinutes`
- `dedupeLookbackDays`
- `maxCandidatesPerRun`

### 4.3 任务（task）

每次手动/定时执行生成任务，记录计数、状态、异常、产物文件路径、去重丢弃记录。

### 4.4 候选（candidate）

标准化 + 去重后的单条候选；保存粗筛/精筛结果。

### 4.5 最终热点（saved hotspot）

仅 `keep_high / keep_normal` 入库（本地文件），用于前端推荐展示和下游消费。

---

## 5. OpenCLI 采集规范

命令形态：

```bash
opencli --profile <profileName> <source> <command> ... -f json
```

示例：

```bash
opencli --profile default weibo hot --limit 20 -f json
opencli --profile default weibo search "OpenAI" --limit 5 -f json
opencli --profile default zhihu hot --limit 20 -f json
opencli --profile default zhihu search "Claude" --limit 5 -f json
opencli --profile default 36kr news --limit 20 -f json
opencli --profile default 36kr search "AI Agent" --limit 5 -f json
opencli --profile default aibase news --limit 20 -f json
```

约束：

1. `profile` 从全局配置读取。
2. 全部命令强制 JSON 输出。
3. keyword 仅用于支持关键词的命令。
4. `hot/ranking/top/latest` 这类命令不带 keyword。
5. `--limit` 是否可用以 adapter 文档和实际运行为准。

---

## 6. 文件落盘规范

### 6.1 raw

```text
data/hotspot-radar/accounts/{accountId}/raw/{yyyy-mm-dd}/{taskId}/{source}_{command}_{HHmmss}.json
data/hotspot-radar/accounts/{accountId}/raw/{yyyy-mm-dd}/{taskId}/{source}_{command}_{keyword}_{HHmmss}.json
```

### 6.2 candidate

```text
data/hotspot-radar/accounts/{accountId}/candidates/{yyyy-mm-dd}/{candidateId}.json
```

### 6.3 saved

```text
data/hotspot-radar/accounts/{accountId}/saved/{yyyy-mm-dd}/{hotspotId}.json
```

### 6.4 index

```text
data/hotspot-radar/accounts/{accountId}/indexes/saved_index.json
data/hotspot-radar/accounts/{accountId}/indexes/candidate_index.json
data/hotspot-radar/accounts/{accountId}/indexes/task_index.json
```

> 列表页优先读取索引，不扫全量文件。

---

## 7. 去重规则（程序执行，非 LLM）

时间窗口：最近 15 天。

扫描范围：

- 近 15 天 `candidates`
- 近 15 天 `saved`
-（如有）近 15 天标准化结果缓存

优先级：

1. URL 重复
2. 标题完全相同
3. 标题标准化后相同

URL 标准化建议：去 tracking/utm、去无意义 query、去尾斜杠、必要时短链展开。

标题标准化建议：trim、空白折叠、去 `#话题#`、统一大小写与全角半角、去平台噪声前后缀。

---

## 8. LLM Web 分层职责

### 8.1 标准化层

只从 `rawOutput` 提取：`title/summary/url/content/author/publishTime/heat/like/comment/share`。

不去重、不匹配账号、不生成推荐话题、不编造正文。

### 8.2 第一层：批量粗筛

输出：`candidate_keep / candidate_review / discard / blocked`。

目标：快速判断是否值得进入精筛。

### 8.3 第二层：单条精筛

输出：`keep_high / keep_normal / review / discard / blocked`，并生成：

- `recommendedTopic`
- `hotspotSummary`
- `reason[]`
- `scores`
- `nextDestinations`

关键规则：

- 无 URL/摘要/正文：不能 `keep_high`
- 只有标题：最多 `review`
- 命中 `avoidTopics`：原则 `discard/blocked`
- 严重过期且无新角度：`discard`

---

## 9. 并发与锁

- 同一账号同一时刻只允许一个热点任务。
- 同一监听器同一时刻只允许一个任务。
- 账号目录使用 `.lock` 文件：任务开始创建，结束删除；锁存在则跳过。

---

## 10. 自动清理（15 天）

每日执行：

- 删除 `raw` 超过 15 天目录
- 删除 `candidates` 超过 15 天且未进入 saved 的文件
- 删除 `tasks` 超过 15 天任务文件（或保留轻量索引）
- 重建 `candidate_index` 与 `task_index`
- `saved_index` 不自动清理

---

## 11. P0 / P1 范围

### P0（本期必须）

- 账号画像文件管理
- 监听器配置（平台/命令/关键词/频率）
- 手动运行 + 定时运行
- 支持平台（P0）：`weibo hot/search`、`zhihu hot/search`、`36kr hot/news/search`、`aibase news`
- raw 保存
- LLM 标准化
- 程序去重（近 15 天 URL/title）
- candidate 保存
- LLM 粗筛 + 精筛
- saved 保存
- 三类索引：`saved_index/candidate_index/task_index`
- 推荐热点列表 + 详情
- 下游入口：话题成文 / 素材二创
- 15 天自动清理

### P1（增强）

扩展更多平台、任务重试、索引重建、锁优化、筛选维度增强等。

---

## 12. 一句话定义

热点雷达是“账号驱动 + 配置驱动 + OpenCLI 采集 + LLM 两层筛选 + 本地文件落盘”的热点筛选流水线：先批量采集，再标准化、去重、粗筛、精筛，最终输出可直接用于内容生产的推荐热点。
