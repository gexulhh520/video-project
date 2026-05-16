# 网页转图文功能 OpenCLI 重构开发文档

## 0. 重构目标

当前项目已经有一套完整的“网页转图文”功能，包括：

- 网页任务创建、列表、详情、删除
- 单链接抓取
- 多链接全自动抓取
- 正文确认与编辑
- 图片池采集与选择
- 二次原创
- 迭代洗稿
- 保存图文结果
- 导出 Word
- 自动导出 Word + 图片目录

本次重构目标不是推翻原功能，而是新增一套 **OpenCLI 驱动版本**，用于替代原来的：

```text
bb-browser + API LLM
```

新的底层链路为：

```text
OpenCLI browser + OpenCLI 访问 Web 大模型
```

要求：

```text
1. 尽量不改动原来的 bb-browser 相关模块。
2. 新增 OpenCLI 专用模块。
3. 保留原来的页面交互体验和数据结构。
4. 原来的保存图文、图片池、Word 导出逻辑继续复用。
5. 默认运行时使用 opencli，但代码层保留 bb-browser 旧方案。
```

---

## 1. 当前项目现状

当前已有核心类型在：

```text
src/main/types/app.types.ts
```

当前已有网页任务服务在：

```text
src/main/services/web-task.service.ts
```

当前已有网页转图文页面在：

```text
src/renderer/src/pages/WebToPostPage.vue
```

当前已有运行时健康检测在：

```text
src/main/services/browser-runtime.service.ts
```

其中 `WebTaskService` 已经负责：

```text
createTask
listTasks
getTaskById
startCrawl
saveRecordBody
retryRecordExtract
collectRecordImages
rewriteTask
rewriteTaskIterative
saveRewriteResult
toggleImageSelection
deleteRecord
deleteTask
renameTask
exportTaskToWord
autoExportTaskBundle
```

所以本次重构的原则是：

```text
WebTaskService 的任务保存模型可以复用；
但不要直接大改旧 WebTaskService。
建议新增 OpenCLI 版 WebTask 服务，然后 IPC 根据 runtime 分发。
```

---

## 2. 新增文件结构建议

建议新增以下文件：

```text
src/main/services/opencli/
  opencli-command-runner.ts
  opencli-runtime.service.ts
  opencli-browser.service.ts
  opencli-web-llm.service.ts
  opencli-web-task.service.ts
  opencli-output-parser.ts
  opencli-image-downloader.ts
```

也可以放在 services 根目录：

```text
src/main/services/opencli-command-runner.ts
src/main/services/opencli-runtime.service.ts
src/main/services/opencli-browser.service.ts
src/main/services/opencli-web-llm.service.ts
src/main/services/opencli-web-task.service.ts
```

推荐用子目录 `services/opencli/`，避免污染旧代码。

---

## 3. 总体架构

### 3.1 原链路

```text
WebToPostPage.vue
  ↓ desktopApi
IPC
  ↓
WebTaskService
  ↓
BrowserRuntimeService
  ↓
BbBrowserService
  ↓
LlmService
```

### 3.2 新链路

```text
WebToPostPage.vue
  ↓ desktopApi
IPC
  ↓
OpenCliWebTaskService
  ↓
OpenCliRuntimeService
  ↓
OpenCliBrowserService
  ↓
OpenCliWebLlmService
```

### 3.3 数据保存仍然不变

```text
workspaceDir/
  web-tasks/
    <taskId>/
      task.json
      images/
        xxx.jpg
        xxx.png
```

`task.json` 继续使用：

```ts
WebCrawlTask
WebCrawlRecord
WebImageAsset
WebRewriteResult
ContentBlock
```

不要新建另一套任务 JSON 格式。

---

## 4. 设置项重构

当前 `WebToPostSettings` 是偏 bb-browser + API LLM 的结构。

请扩展，不要删除旧字段：

```ts
export type WebToPostRuntime = "bb-browser" | "opencli";

export type OpenCliProvider =
  | "chatgpt"
  | "gemini"
  | "claude"
  | "grok"
  | "doubao"
  | "yuanbao";

export type WebToPostSettings = {
  // 旧字段，保留
  llmApiKey: string;
  llmModel: string;
  bbBrowserCommand: string;
  bbBrowserArgs: string;
  bbBrowserMcpCommand: string;
  bbBrowserMcpArgs: string;

  // 新字段
  runtime?: WebToPostRuntime;

  openCliCommand?: string;          // 默认 opencli
  openCliProfile?: string;          // 例如 8qatyy5j
  openCliProvider?: OpenCliProvider;// 默认 chatgpt
  openCliPollIntervalMs?: number;   // 默认 3000
  openCliTimeoutMs?: number;        // 默认 180000
};
```

默认配置建议：

```ts
{
  runtime: "opencli",
  openCliCommand: "opencli",
  openCliProvider: "chatgpt",
  openCliPollIntervalMs: 3000,
  openCliTimeoutMs: 180000
}
```

---

## 5. 新增 OpenCLI 健康状态类型

在 `src/main/types/app.types.ts` 中新增：

```ts
export type OpenCliProfileStatus = {
  id: string;
  status: "connected" | "disconnected" | "unknown";
  version?: string;
};

export type OpenCliRuntimeHealthStatus = {
  healthy: boolean;
  checkedAt: string;
  message: string;
  rawOutput?: string;
  profiles: OpenCliProfileStatus[];
  selectedProfile?: string;
};

export type OpenCliProviderStatus = {
  provider: OpenCliProvider;
  profile?: string;
  ready: boolean;
  message: string;
  rawOutput?: string;
};
```

也可以复用已有 `BrowserRuntimeHealthStatus`，但建议新增类型，避免和 bb-browser 的 `daemonRunning/cdpConnected` 概念混在一起。

---

## 6. 新增 OpenCliCommandRunner

文件：

```text
src/main/services/opencli/opencli-command-runner.ts
```

职责：

```text
1. 统一执行 opencli 命令。
2. 统一处理 stdout/stderr。
3. 统一处理 timeout。
4. Windows 下不要使用 shell:true。
5. opencli 在 Windows 下需要兼容 opencli.cmd。
6. stderr 中的 Extension update available 不应当作为失败。
```

实现示例：

```ts
import { spawn } from "node:child_process";

export type OpenCliCommandResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export type RunOpenCliOptions = {
  timeoutMs?: number;
  ignoreError?: boolean;
  env?: NodeJS.ProcessEnv;
};

export class OpenCliCommandRunner {
  constructor(private readonly openCliCommand = "opencli") {}

  async run(args: string[], options: RunOpenCliOptions = {}): Promise<OpenCliCommandResult> {
    const timeoutMs = options.timeoutMs ?? 60000;
    const ignoreError = options.ignoreError ?? false;

    return new Promise((resolve, reject) => {
      const child = spawn(this.normalizeExecutable(this.openCliCommand), args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          ...options.env
        }
      });

      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        child.kill();
        if (ignoreError) {
          resolve({
            stdout,
            stderr: `${stderr}\nCommand timed out`,
            code: null
          });
          return;
        }

        reject(new Error(`OpenCLI command timed out: opencli ${args.join(" ")}`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timer);

        if (ignoreError) {
          resolve({
            stdout,
            stderr: `${stderr}\n${error.message}`,
            code: null
          });
          return;
        }

        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timer);

        if (code !== 0 && !ignoreError) {
          reject(new Error(`OpenCLI command failed (${code}): opencli ${args.join(" ")}\n${stderr || stdout}`));
          return;
        }

        resolve({
          stdout,
          stderr,
          code
        });
      });
    });
  }

  private normalizeExecutable(command: string): string {
    if (process.platform === "win32" && command.toLowerCase() === "opencli") {
      return "opencli.cmd";
    }

    return command;
  }
}
```

---

## 7. 新增 OpenCliOutputParser

文件：

```text
src/main/services/opencli/opencli-output-parser.ts
```

职责：

```text
1. 解析 opencli doctor 输出中的 profile。
2. 解析 opencli JSON 输出。
3. 处理 stdout/stderr 被更新提示污染的情况。
4. 提取最后一条 Assistant 消息。
5. 判断 Web 大模型输出是否稳定。
```

实现示例：

```ts
import type { OpenCliProfileStatus } from "../../types/app.types";

export function parseOpenCliProfiles(output: string): OpenCliProfileStatus[] {
  const profiles: OpenCliProfileStatus[] = [];
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/•\s*([^:]+):\s*(connected|disconnected)(?:\s+v?([\d.]+))?/i);
    if (!match) continue;

    profiles.push({
      id: match[1].trim(),
      status: match[2].toLowerCase() as "connected" | "disconnected",
      version: match[3]
    });
  }

  return profiles;
}

export function getFirstConnectedProfile(output: string): string | undefined {
  return parseOpenCliProfiles(output).find((item) => item.status === "connected")?.id;
}

export function parseOpenCliJson<T = unknown>(output: string): T {
  const text = String(output || "").trim();

  try {
    return JSON.parse(text) as T;
  } catch {
    // continue
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return JSON.parse(text.slice(arrayStart, arrayEnd + 1)) as T;
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return JSON.parse(text.slice(objectStart, objectEnd + 1)) as T;
  }

  throw new Error("OpenCLI output is not valid JSON.");
}

export type OpenCliChatMessage = {
  Index: number;
  Role: "User" | "Assistant" | string;
  Text: string;
};

export function getLastAssistantText(messages: OpenCliChatMessage[]): string | null {
  const assistantMessages = messages.filter((item) => item.Role === "Assistant");
  if (!assistantMessages.length) return null;

  const text = String(assistantMessages.at(-1)?.Text || "").trim();
  if (!text) return null;

  const pendingWords = [
    "Thinking",
    "正在思考",
    "思考中",
    "生成中",
    "正在生成"
  ];

  if (pendingWords.some((word) => text.includes(word))) {
    return null;
  }

  return text;
}
```

---

## 8. 新增 OpenCliRuntimeService

文件：

```text
src/main/services/opencli/opencli-runtime.service.ts
```

职责：

```text
1. 执行 opencli doctor。
2. 解析 Profiles 下 connected profile。
3. 只要存在 connected profile，healthy = true。
4. selectedProfile 使用第一个 connected profile。
5. repair 执行 opencli daemon stop，然后 opencli doctor。
6. 供进入网页转图文选项卡时自动检测使用。
```

命令：

```bash
opencli doctor
```

修复命令：

```bash
opencli daemon stop
opencli doctor
```

实现示例：

```ts
import type { OpenCliRuntimeHealthStatus } from "../../types/app.types";
import { OpenCliCommandRunner } from "./opencli-command-runner";
import { parseOpenCliProfiles } from "./opencli-output-parser";

export class OpenCliRuntimeService {
  constructor(private readonly runner: OpenCliCommandRunner) {}

  async checkHealth(): Promise<OpenCliRuntimeHealthStatus> {
    const result = await this.runner.run(["doctor"], {
      timeoutMs: 30000,
      ignoreError: true
    });

    const merged = `${result.stdout}\n${result.stderr}`.trim();
    const profiles = parseOpenCliProfiles(merged);
    const connectedProfile = profiles.find((item) => item.status === "connected");

    return {
      healthy: Boolean(connectedProfile),
      checkedAt: new Date().toISOString(),
      message: connectedProfile
        ? `OpenCLI 已连接 Profile：${connectedProfile.id}`
        : "OpenCLI 未检测到 connected profile，请确认 Chrome 已打开且 OpenCLI 扩展已启用。",
      rawOutput: merged,
      profiles,
      selectedProfile: connectedProfile?.id
    };
  }

  async repair(): Promise<OpenCliRuntimeHealthStatus> {
    await this.runner.run(["daemon", "stop"], {
      timeoutMs: 15000,
      ignoreError: true
    });

    return this.checkHealth();
  }

  async ensureHealthy(): Promise<OpenCliRuntimeHealthStatus> {
    const first = await this.checkHealth();
    if (first.healthy) return first;

    const repaired = await this.repair();
    if (!repaired.healthy) {
      throw new Error(repaired.rawOutput || "OpenCLI 修复后仍然不可用。");
    }

    return repaired;
  }
}
```

---

## 9. 新增 OpenCliBrowserService

文件：

```text
src/main/services/opencli/opencli-browser.service.ts
```

职责：

```text
1. 打开网页。
2. 等待页面。
3. 获取标题。
4. 提取正文。
5. 获取当前页面图片地址。
6. 关闭 session。
```

对应命令：

```bash
opencli --profile <profile> browser <session> open <url>
opencli --profile <profile> browser <session> wait time 3
opencli --profile <profile> browser <session> get title
opencli --profile <profile> browser <session> extract --chunk-size 8000
opencli --profile <profile> browser <session> eval <js> -f json
opencli --profile <profile> browser <session> close
```

实现示例：

```ts
import { OpenCliCommandRunner } from "./opencli-command-runner";
import { parseOpenCliJson } from "./opencli-output-parser";

export type OpenCliImageCandidate = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export class OpenCliBrowserService {
  constructor(private readonly runner: OpenCliCommandRunner) {}

  async open(profile: string, sessionName: string, url: string): Promise<void> {
    await this.runner.run([
      "--profile",
      profile,
      "browser",
      sessionName,
      "open",
      url
    ], {
      timeoutMs: 60000
    });
  }

  async wait(profile: string, sessionName: string, seconds: number): Promise<void> {
    await this.runner.run([
      "--profile",
      profile,
      "browser",
      sessionName,
      "wait",
      "time",
      String(seconds)
    ], {
      timeoutMs: Math.max(10000, seconds * 1000 + 5000)
    });
  }

  async getTitle(profile: string, sessionName: string): Promise<string> {
    const result = await this.runner.run([
      "--profile",
      profile,
      "browser",
      sessionName,
      "get",
      "title"
    ], {
      timeoutMs: 30000
    });

    return result.stdout.trim();
  }

  async extract(profile: string, sessionName: string, chunkSize = 8000): Promise<string> {
    const result = await this.runner.run([
      "--profile",
      profile,
      "browser",
      sessionName,
      "extract",
      "--chunk-size",
      String(chunkSize)
    ], {
      timeoutMs: 90000
    });

    return result.stdout.trim();
  }

  async collectImageUrls(profile: string, sessionName: string): Promise<OpenCliImageCandidate[]> {
    const js = `
(() => Array.from(document.images)
  .map(img => ({
    src: img.currentSrc || img.src || "",
    alt: img.alt || "",
    width: img.naturalWidth || img.width || 0,
    height: img.naturalHeight || img.height || 0
  }))
  .filter(x => x.src && x.width >= 120 && x.height >= 120)
)()
`;

    const result = await this.runner.run([
      "--profile",
      profile,
      "browser",
      sessionName,
      "eval",
      js,
      "-f",
      "json"
    ], {
      timeoutMs: 60000
    });

    return parseOpenCliJson<OpenCliImageCandidate[]>(result.stdout);
  }

  async close(profile: string, sessionName: string): Promise<void> {
    await this.runner.run([
      "--profile",
      profile,
      "browser",
      sessionName,
      "close"
    ], {
      timeoutMs: 15000,
      ignoreError: true
    });
  }
}
```

注意：

```text
不要通过 shell 字符串执行 eval 代码。
必须用 spawn 参数数组。
否则 Windows 下 |、=>、() 可能被 cmd 解释。
```

---

## 10. 新增 OpenCliImageDownloader

文件：

```text
src/main/services/opencli/opencli-image-downloader.ts
```

职责：

```text
1. 接收图片 URL 列表。
2. 下载到 task/images 目录。
3. 返回 sourceUrl/localPath/failedReason。
4. 第一版可以使用 Node fetch 下载。
5. 如果遇到登录态图片下载失败，先标记 failedReason。
6. 后续再增强为浏览器上下文下载。
```

实现示例：

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

export type ImageDownloadResult = {
  sourceUrl: string;
  localPath?: string;
  failedReason?: string;
};

export class OpenCliImageDownloader {
  async downloadImages(urls: string[], outputDir: string): Promise<ImageDownloadResult[]> {
    await mkdir(outputDir, { recursive: true });

    const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));

    const results: ImageDownloadResult[] = [];

    for (const url of uniqueUrls) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0"
          }
        });

        if (!response.ok) {
          results.push({
            sourceUrl: url,
            failedReason: `HTTP ${response.status}`
          });
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const extension = this.inferExtension(url, response.headers.get("content-type"));
        const localPath = join(outputDir, `${randomUUID()}${extension}`);

        await writeFile(localPath, buffer);

        results.push({
          sourceUrl: url,
          localPath
        });
      } catch (error) {
        results.push({
          sourceUrl: url,
          failedReason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  private inferExtension(url: string, contentType?: string | null): string {
    const fromUrl = extname(new URL(url).pathname);
    if (fromUrl && fromUrl.length <= 8) return fromUrl;

    if (contentType?.includes("png")) return ".png";
    if (contentType?.includes("webp")) return ".webp";
    if (contentType?.includes("gif")) return ".gif";

    return ".jpg";
  }
}
```

---

## 11. 新增 OpenCliWebLlmService

文件：

```text
src/main/services/opencli/opencli-web-llm.service.ts
```

职责：

```text
1. 使用 opencli 访问 ChatGPT/Gemini/Claude 等 Web 大模型。
2. send prompt。
3. read --format json。
4. 轮询直到 Assistant 输出稳定。
5. 提供 extractArticleFromBody。
6. 提供 rewriteWebContent。
7. 输出 WebRewriteResult。
```

### 11.1 Provider 命令映射

第一版优先支持 ChatGPT：

```ts
const providerCommandMap = {
  chatgpt: "chatgpt",
  gemini: "gemini",
  claude: "claude",
  grok: "grok",
  doubao: "doubao",
  yuanbao: "yuanbao"
} as const;
```

不同 provider 命令可能不是完全一致。

第一版建议：

```text
先只完整实现 chatgpt。
其他 provider 页面上显示“待适配”或走相同 send/read 兼容层。
```

ChatGPT 命令：

```bash
opencli --profile <profile> chatgpt send "<prompt>" --new
opencli --profile <profile> chatgpt read --format json
```

### 11.2 实现示例

```ts
import type { ContentBlock, OpenCliProvider, WebRewriteResult } from "../../types/app.types";
import { OpenCliCommandRunner } from "./opencli-command-runner";
import { getLastAssistantText, parseOpenCliJson, type OpenCliChatMessage } from "./opencli-output-parser";

export class OpenCliWebLlmService {
  constructor(private readonly runner: OpenCliCommandRunner) {}

  async send(provider: OpenCliProvider, profile: string, prompt: string, newChat = true): Promise<void> {
    const command = this.resolveProviderCommand(provider);

    const args = [
      "--profile",
      profile,
      command,
      "send",
      prompt
    ];

    if (newChat) {
      args.push("--new");
    }

    await this.runner.run(args, {
      timeoutMs: 60000
    });
  }

  async read(provider: OpenCliProvider, profile: string): Promise<OpenCliChatMessage[]> {
    const command = this.resolveProviderCommand(provider);

    const result = await this.runner.run([
      "--profile",
      profile,
      command,
      "read",
      "--format",
      "json"
    ], {
      timeoutMs: 60000
    });

    return parseOpenCliJson<OpenCliChatMessage[]>(result.stdout);
  }

  async pollResult(options: {
    provider: OpenCliProvider;
    profile: string;
    timeoutMs: number;
    intervalMs: number;
  }): Promise<string> {
    const startedAt = Date.now();
    let lastText = "";
    let stableCount = 0;

    while (Date.now() - startedAt < options.timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, options.intervalMs));

      const messages = await this.read(options.provider, options.profile);
      const text = getLastAssistantText(messages);

      if (!text) continue;

      if (text === lastText) {
        stableCount += 1;
      } else {
        lastText = text;
        stableCount = 0;
      }

      // 连续两次读取稳定，认为输出结束
      if (stableCount >= 1) {
        return text;
      }
    }

    throw new Error("Web 大模型响应超时，请检查页面是否仍在生成或是否需要登录。");
  }

  async askAndWait(options: {
    provider: OpenCliProvider;
    profile: string;
    prompt: string;
    timeoutMs: number;
    intervalMs: number;
  }): Promise<string> {
    await this.send(options.provider, options.profile, options.prompt, true);

    return this.pollResult({
      provider: options.provider,
      profile: options.profile,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs
    });
  }

  async extractArticleFromBody(options: {
    provider: OpenCliProvider;
    profile: string;
    title: string;
    body: string;
    userPrompt?: string;
    timeoutMs: number;
    intervalMs: number;
  }): Promise<string> {
    const prompt = `
你是中文网页正文提取助手。

请根据【网页标题】和【网页内容】，提取适合做图文稿的正文。

要求：
1. 去掉广告、导航、版权、相关推荐、无关评论。
2. 保留核心事实、观点、步骤、案例。
3. 按自然段输出。
4. 不要输出解释，不要寒暄。
5. 如果原文内容很乱，请主动整理成清晰正文。
6. 不强制 JSON，直接输出正文即可。

用户补充要求：
${options.userPrompt || "无"}

网页标题：
${options.title}

网页内容：
${options.body}
`;

    return this.askAndWait({
      provider: options.provider,
      profile: options.profile,
      prompt,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs
    });
  }

  async rewriteWebContent(options: {
    provider: OpenCliProvider;
    profile: string;
    taskTitle: string;
    records: Array<{ title: string; body: string }>;
    prompt: string;
    sourceRecordIds: string[];
    selectedImagePaths: string[];
    timeoutMs: number;
    intervalMs: number;
  }): Promise<WebRewriteResult> {
    const sourceText = options.records
      .map((record, index) => `【资料 ${index + 1}】\n标题：${record.title}\n正文：\n${record.body}`)
      .join("\n\n---\n\n");

    const prompt = `
你是中文自媒体图文编辑助手。

请根据下面资料，生成一篇适合发布到公众号、小红书、知乎的原创图文稿。

要求：
1. 标题要有吸引力。
2. 正文必须二次原创，不要照搬原文。
3. 逻辑连贯，段落清晰。
4. 每段 80-180 字。
5. 不要输出解释，不要寒暄。
6. 输出格式：
标题：xxx

正文：
第一段...
第二段...
第三段...

用户改写要求：
${options.prompt || "无"}

任务主题：
${options.taskTitle}

资料：
${sourceText}
`;

    const text = await this.askAndWait({
      provider: options.provider,
      profile: options.profile,
      prompt,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs
    });

    const parsed = this.parseTitleAndParagraphs(text);
    const now = new Date().toISOString();

    const contentBlocks = this.buildContentBlocks(parsed.paragraphs, options.selectedImagePaths);

    return {
      title: parsed.title || options.taskTitle || "未命名图文稿",
      paragraphs: parsed.paragraphs,
      contentBlocks,
      fullText: parsed.paragraphs.join("\n\n"),
      createdAt: now,
      updatedAt: now,
      prompt: options.prompt,
      sourceRecordIds: options.sourceRecordIds
    };
  }

  private parseTitleAndParagraphs(text: string): { title: string; paragraphs: string[] } {
    const clean = String(text || "").replace(/\r/g, "").trim();
    const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);

    let title = "";
    let bodyText = clean;

    const titleLine = lines.find((line) => /^标题[:：]/.test(line));
    if (titleLine) {
      title = titleLine.replace(/^标题[:：]/, "").trim();
      bodyText = clean.replace(titleLine, "").replace(/^正文[:：]/m, "").trim();
    } else if (lines.length > 1 && lines[0].length <= 40) {
      title = lines[0].replace(/^#+\s*/, "").trim();
      bodyText = lines.slice(1).join("\n").replace(/^正文[:：]/m, "").trim();
    }

    const paragraphs = bodyText
      .split(/\n{2,}|\n(?=\d+[\.、])|\n(?=第.{1,3}段[:：]?)/)
      .map((item) => item.replace(/^正文[:：]/, "").trim())
      .filter(Boolean)
      .filter((item) => !/^标题[:：]/.test(item));

    return {
      title,
      paragraphs
    };
  }

  private buildContentBlocks(paragraphs: string[], imagePaths: string[]): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    paragraphs.forEach((paragraph, index) => {
      const sectionId = `web_s_${index + 1}`;

      blocks.push({
        type: "paragraph",
        blockId: `${sectionId}_p`,
        sectionId,
        text: paragraph
      });

      const imagePath = imagePaths[index];
      if (imagePath) {
        blocks.push({
          type: "image",
          blockId: `${sectionId}_i`,
          sectionId,
          imagePath,
          time: 0,
          caption: "网页图片",
          sourceType: "auto"
        });
      }
    });

    return blocks;
  }

  private resolveProviderCommand(provider: OpenCliProvider): string {
    if (provider === "chatgpt") return "chatgpt";
    if (provider === "gemini") return "gemini";
    if (provider === "claude") return "claude";
    if (provider === "grok") return "grok";
    if (provider === "doubao") return "doubao";
    if (provider === "yuanbao") return "yuanbao";

    return "chatgpt";
  }
}
```

---

## 12. 新增 OpenCliWebTaskService

文件：

```text
src/main/services/opencli/opencli-web-task.service.ts
```

职责：

```text
尽量复制 WebTaskService 的业务流程，但底层服务换成 OpenCLI。
```

不要直接继承旧 `WebTaskService`，因为旧类强依赖：

```ts
BrowserRuntimeService
BbBrowserService
LlmService
```

建议复制必要代码，保持方法签名一致：

```ts
createTask
listTasks
getTaskById
startCrawl
saveRecordBody
retryRecordExtract
collectRecordImages
toggleImageSelection
deleteRecord
rewriteTask
rewriteTaskIterative
saveRewriteResult
deleteTask
renameTask
exportTaskToWord
autoExportTaskBundle
```

其中：

```text
任务保存相关代码可以从旧 WebTaskService 复制。
Word 导出相关代码可以复制。
图片导出相关代码可以复制。
区别只在 startCrawl / retryRecordExtract / collectRecordImages / rewriteTask / rewriteTaskIterative。
```

### 12.1 startCrawl 新流程

旧流程：

```text
check bb-browser health
open url
wait page
get title
snapshot
llm extract
save record
```

新流程：

```text
check opencli health
select connected profile
open url
wait page
get title
extract page markdown
send to Web LLM for正文提取
save record
```

伪代码：

```ts
async startCrawl(taskId, options, onProgress) {
  const task = await this.getTaskById(taskId);
  const record = this.prepareRecord(task, options);

  try {
    emit checking_runtime_health;
    const health = await this.openCliRuntimeService.ensureHealthy();
    const settings = await this.settingsService.getWebToPostSettings();
    const profile = settings.openCliProfile || health.selectedProfile;

    if (!profile) throw new Error("未检测到 OpenCLI connected profile。");

    task.runtimeHealth = {
      healthy: health.healthy,
      daemonRunning: health.healthy,
      cdpConnected: Boolean(profile),
      checkedAt: health.checkedAt,
      message: health.message,
      rawOutput: health.rawOutput
    };

    emit opening_page;
    const sessionName = `web_${record.recordId}`;
    await this.openCliBrowserService.open(profile, sessionName, record.sourceUrl);
    record.tabId = sessionName;
    record.lastRunAt = new Date().toISOString();

    emit waiting_page_ready;
    await this.openCliBrowserService.wait(profile, sessionName, 3);

    emit fetching_title;
    record.title = await this.openCliBrowserService.getTitle(profile, sessionName);

    emit capturing_snapshot;
    record.snapshot = await this.openCliBrowserService.extract(profile, sessionName, 8000);

    emit extracting_article;
    record.extractedBody = await this.openCliWebLlmService.extractArticleFromBody({
      provider: settings.openCliProvider || "chatgpt",
      profile,
      title: record.title,
      body: record.snapshot,
      userPrompt: record.extractPrompt,
      timeoutMs: settings.openCliTimeoutMs || 180000,
      intervalMs: settings.openCliPollIntervalMs || 3000
    });

    record.userEditedBody = record.extractedBody;
    record.status = "awaiting_user_confirmation";
    task.status = "awaiting_user_confirmation";

    await this.saveTask(task);
    emit awaiting_user_confirmation;

    return task;
  } catch (error) {
    record.status = "failed";
    record.failureReason = error instanceof Error ? error.message : "抓取失败";
    task.status = "failed";
    await this.saveTask(task);
    emit failed;
    return task;
  }
}
```

### 12.2 retryRecordExtract 新流程

旧逻辑使用：

```ts
llmService.extractArticleFromSnapshot(record.title, record.snapshot, prompt)
```

新逻辑使用：

```ts
openCliWebLlmService.extractArticleFromBody(...)
```

### 12.3 collectRecordImages 新流程

旧逻辑：

```ts
urls = await bbBrowserService.collectImageUrls(record.tabId)
downloads = await bbBrowserService.downloadImages(...)
```

新逻辑：

```ts
urls = await openCliBrowserService.collectImageUrls(profile, sessionName)
downloads = await openCliImageDownloader.downloadImages(urls.map(x => x.src), imagesDir)
```

仍然生成相同的 `WebImageAsset[]`：

```ts
const assets: WebImageAsset[] = downloads.map((download) => ({
  assetId: uuidv4(),
  sourceUrl: download.sourceUrl,
  localPath: download.localPath,
  originRecordId: record.recordId,
  selected: Boolean(download.localPath),
  downloadedAt: download.localPath ? new Date().toISOString() : undefined,
  failedReason: download.failedReason
}));
```

### 12.4 rewriteTask 新流程

旧逻辑：

```ts
llmService.rewriteWebContent(...)
```

新逻辑：

```ts
openCliWebLlmService.rewriteWebContent(...)
```

需要把当前任务中已选图片传入：

```ts
const selectedImagePaths = task.imageAssets
  .filter(asset => asset.selected && asset.localPath && sourceRecordIds.includes(asset.originRecordId))
  .map(asset => asset.localPath as string);
```

### 12.5 rewriteTaskIterative 新流程

旧逻辑基于当前 `rewriteResult.fullText` 再次洗稿。

新逻辑相同，只是 LLM 调用换成 `OpenCliWebLlmService.rewriteWebContent()`。

---

## 13. IPC 改造建议

当前 IPC 里应该已经有：

```text
listWebTasks
getWebTaskById
createWebTask
startWebCrawl
saveWebRecordBody
retryWebRecordExtract
collectWebRecordImages
rewriteWebTask
rewriteWebTaskIterative
saveWebRewriteResult
toggleWebImageSelection
deleteWebRecord
deleteWebTask
renameWebTask
exportWebTaskToWord
autoExportWebTaskBundle
```

不建议新增一套页面 API 名字。

建议保持前端调用不变：

```ts
desktopApi.startWebCrawl(...)
desktopApi.collectWebRecordImages(...)
desktopApi.rewriteWebTask(...)
```

在 main 进程里根据 settings.runtime 分发：

```ts
function getActiveWebTaskService() {
  const settings = await settingsService.getWebToPostSettings();
  return settings.runtime === "opencli"
    ? openCliWebTaskService
    : webTaskService;
}
```

也可以第一版直接让原有 IPC 指向 `OpenCliWebTaskService`，旧 `WebTaskService` 暂时保留不用。

新增 IPC：

```text
checkOpenCliHealth
repairOpenCliRuntime
openOpenCliProviderLoginPage
testOpenCliProvider
```

---

## 14. preload 改造

在 `DesktopApi` 类型里新增：

```ts
checkOpenCliHealth: () => Promise<OpenCliRuntimeHealthStatus>;
repairOpenCliRuntime: () => Promise<OpenCliRuntimeHealthStatus>;
openOpenCliProviderLoginPage: (provider: OpenCliProvider, profile?: string) => Promise<void>;
testOpenCliProvider: (provider: OpenCliProvider, profile?: string) => Promise<OpenCliProviderStatus>;
```

在 `src/preload/index.ts` 暴露对应 IPC。

---

## 15. 前端 WebToPostPage 改造

当前页面已经有完整的任务列表、抓取、确认正文、抓图、二次原创、导出逻辑。

不要重写页面。

只新增一个 OpenCLI 运行时状态区域。

### 15.1 新增状态变量

```ts
const openCliHealth = ref<OpenCliRuntimeHealthStatus | null>(null);
const openCliRepairing = ref(false);
const openCliTesting = ref(false);
const openCliSelectedProfile = ref("");
const openCliProvider = ref<OpenCliProvider>("chatgpt");
```

### 15.2 onMounted 时自动检测

当前 `bootstrap()` 是：

```ts
await Promise.all([loadToolConfigStatus(), refreshTaskList()]);
```

改为：

```ts
async function bootstrap(): Promise<void> {
  await Promise.all([
    loadToolConfigStatus(),
    refreshTaskList(),
    checkOpenCliHealthOnEnter()
  ]);
}
```

实现：

```ts
async function checkOpenCliHealthOnEnter(): Promise<void> {
  try {
    openCliHealth.value = await desktopApi.checkOpenCliHealth();

    if (openCliHealth.value.healthy && openCliHealth.value.selectedProfile) {
      openCliSelectedProfile.value = openCliHealth.value.selectedProfile;

      const settings = await desktopApi.getWebToPostSettings();
      await desktopApi.saveWebToPostSettings({
        ...settings,
        runtime: "opencli",
        openCliProfile: openCliHealth.value.selectedProfile,
        openCliProvider: settings.openCliProvider || "chatgpt"
      });

      await loadToolConfigStatus();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "OpenCLI 检测失败";
  }
}
```

### 15.3 页面新增 UI 区域

建议放在网页转图文顶部，配置状态卡片里。

文案：

```text
OpenCLI 运行状态
状态：正常 / 异常
当前 Profile：8qatyy5j connected v1.0.14
大模型：ChatGPT

[重新检测]
[一键修复]
[启动大模型登录页]
[测试大模型]
```

异常时显示：

```text
未检测到 connected profile。
请确认：
1. Chrome 已打开
2. OpenCLI 扩展已启用
3. 已经运行 opencli doctor
4. 浏览器 Profile 已连接
```

### 15.4 一键修复

```ts
async function repairOpenCli(): Promise<void> {
  openCliRepairing.value = true;
  errorMessage.value = "";

  try {
    openCliHealth.value = await desktopApi.repairOpenCliRuntime();
    if (openCliHealth.value.healthy && openCliHealth.value.selectedProfile) {
      openCliSelectedProfile.value = openCliHealth.value.selectedProfile;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "OpenCLI 修复失败";
  } finally {
    openCliRepairing.value = false;
  }
}
```

### 15.5 启动大模型登录页

点击后：

```ts
await desktopApi.openOpenCliProviderLoginPage(openCliProvider.value, openCliSelectedProfile.value);
```

后端执行：

```bash
opencli --profile <profile> browser llm_login open "https://chatgpt.com"
```

provider URL 映射：

```ts
chatgpt -> https://chatgpt.com
gemini  -> https://gemini.google.com
claude  -> https://claude.ai
grok    -> https://grok.com
doubao  -> https://www.doubao.com
yuanbao -> https://yuanbao.tencent.com
```

### 15.6 测试大模型

后端执行：

```bash
opencli --profile <profile> chatgpt send "请只回复：连接成功" --new
opencli --profile <profile> chatgpt read --format json
```

前端展示：

```text
测试成功：连接成功
```

---

## 16. WebToPostConfigStatus 改造

当前状态大概率检查：

```text
hasLlmApiKey
hasBbBrowserCommand
resolvedLlmModel
```

OpenCLI 版应该改成：

```ts
export type WebToPostConfigStatus = {
  ready: boolean;

  // 旧字段保留
  hasLlmApiKey: boolean;
  hasBbBrowserCommand: boolean;
  resolvedLlmModel: string;

  // 新字段
  runtime?: "bb-browser" | "opencli";
  hasOpenCliCommand?: boolean;
  hasOpenCliProfile?: boolean;
  openCliProfile?: string;
  openCliProvider?: OpenCliProvider;

  missingItems: string[];
};
```

OpenCLI runtime 下判断：

```text
ready = hasOpenCliCommand && hasOpenCliProfile
```

不要再要求 `llmApiKey`。

---

## 17. 任务状态沿用

继续沿用现有 `WebTaskStatus`：

```ts
"idle"
"checking_runtime_health"
"resetting_runtime"
"opening_page"
"waiting_page_ready"
"fetching_title"
"capturing_snapshot"
"extracting_article"
"awaiting_user_confirmation"
"collecting_images"
"closing_tab"
"ready_for_next_url"
"rewriting"
"completed"
"failed"
```

消息文案改为 OpenCLI：

```text
正在检查 OpenCLI 运行环境
OpenCLI 异常，正在尝试重启 daemon
正在通过 OpenCLI 打开页面
正在提取当前页面正文
正在提交正文给 Web 大模型
正在轮询 Web 大模型结果
```

---

## 18. OpenCLI 调用命令清单

### 18.1 健康检查

```bash
opencli doctor
```

### 18.2 修复

```bash
opencli daemon stop
opencli doctor
```

### 18.3 打开网页

```bash
opencli --profile 8qatyy5j browser web_<recordId> open "https://example.com"
```

### 18.4 等待页面

```bash
opencli --profile 8qatyy5j browser web_<recordId> wait time 3
```

### 18.5 获取标题

```bash
opencli --profile 8qatyy5j browser web_<recordId> get title
```

### 18.6 提取正文

```bash
opencli --profile 8qatyy5j browser web_<recordId> extract --chunk-size 8000
```

### 18.7 提取图片

```bash
opencli --profile 8qatyy5j browser web_<recordId> eval "(() => Array.from(document.images).map(img => ({src: img.currentSrc || img.src, alt: img.alt || '', width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0})).filter(x => x.src && x.width >= 120 && x.height >= 120))()" -f json
```

### 18.8 ChatGPT 发送

```bash
opencli --profile 8qatyy5j chatgpt send "提示词" --new
```

### 18.9 ChatGPT 读取

```bash
opencli --profile 8qatyy5j chatgpt read --format json
```

---

## 19. 并发限制

必须实现 profile 级别互斥。

原因：

```text
同一个 OpenCLI profile 同时操作同一个 ChatGPT 页面，会串会话、抢输入框、读错结果。
```

第一版简单做法：

```ts
class OpenCliProfileLock {
  private locks = new Map<string, Promise<void>>();

  async runExclusive<T>(profile: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(profile) ?? Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.locks.set(profile, previous.then(() => current));

    await previous;

    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(profile) === current) {
        this.locks.delete(profile);
      }
    }
  }
}
```

在调用 Web 大模型时使用：

```ts
await profileLock.runExclusive(profile, async () => {
  await openCliWebLlmService.askAndWait(...);
});
```

如果当前项目没有任务队列，至少保证页面按钮执行期间 `busy=true`，并在服务层加锁。

---

## 20. 错误处理

### 20.1 OpenCLI 无 profile

错误文案：

```text
OpenCLI 未检测到 connected profile。
请打开 Chrome，确认 OpenCLI 扩展已启用，然后点击“一键修复”或重新检测。
```

### 20.2 ChatGPT 未登录

错误文案：

```text
Web 大模型未登录或输入框不可用。
请点击“启动大模型登录页”，登录后再测试连接。
```

### 20.3 read 不是 JSON

处理：

```text
1. 先 JSON.parse(stdout)
2. 失败后截取第一个 [ 到最后一个 ]
3. 再失败，报错并记录 rawOutput
```

### 20.4 生成超时

错误文案：

```text
Web 大模型响应超时，请检查页面是否仍在生成、是否弹出验证码、是否额度不足。
```

### 20.5 图片下载失败

不要让整个任务失败。

保存：

```ts
{
  sourceUrl,
  selected: false,
  failedReason: "HTTP 403"
}
```

前端图片池里显示下载失败即可。

---

## 21. 不要做的事

```text
1. 不要删除旧 BbBrowserService。
2. 不要删除旧 BrowserRuntimeService。
3. 不要删除旧 LlmService。
4. 不要重写 Word 导出。
5. 不要改变 task.json 主体结构。
6. 不要让前端重新做一套页面。
7. 不要 shell:true 执行 opencli。
8. 不要强依赖大模型返回严格 JSON。
9. 不要只判断 Index=2，要取最后一条 Assistant。
10. 不要同一 profile 并发执行多个 Web 大模型任务。
```

---

## 22. 最小可交付 MVP

第一阶段只要求完成：

```text
1. OpenCLI 健康检测。
2. 进入选项卡自动解析 connected profile。
3. 一键修复：opencli daemon stop + opencli doctor。
4. 启动 ChatGPT 登录页。
5. 测试 ChatGPT 连接。
6. 使用 OpenCLI 打开网页。
7. 使用 OpenCLI 提取页面正文。
8. 使用 OpenCLI ChatGPT 提取正文。
9. 保存到原 WebCrawlTask。
10. 使用 OpenCLI 提取图片 URL。
11. 下载图片并保存到原 imageAssets。
12. 使用 OpenCLI ChatGPT 做二次原创。
13. 生成原 WebRewriteResult。
14. 原 Word 导出可用。
```

Provider 第一版只需要完整支持：

```text
chatgpt
```

其他 provider 先预留配置，不强制实现。

---

## 23. 验收标准

### 23.1 健康检测

打开网页转图文选项卡后：

```text
能自动执行 opencli doctor
能解析出 8qatyy5j: connected v1.0.14
能自动保存 openCliProfile=8qatyy5j
```

### 23.2 修复

点击一键修复后：

```text
能执行 opencli daemon stop
能再次执行 opencli doctor
能刷新健康状态
```

### 23.3 登录页

点击启动大模型登录页：

```text
能打开 https://chatgpt.com
用户可以手动登录
```

### 23.4 测试连接

点击测试连接：

```text
能发送“请只回复：连接成功”
能轮询 read --format json
能展示连接成功
```

### 23.5 网页抓取

输入 URL 后：

```text
能打开网页
能读取标题
能提取正文
能把正文提交给 ChatGPT Web
能轮询拿到提取结果
能保存到 WebCrawlRecord.userEditedBody
```

### 23.6 图片抓取

点击抓取图片：

```text
能通过 opencli browser eval 获取图片列表
能下载图片到 web-tasks/<taskId>/images
能生成 WebImageAsset
能在页面图片池展示
```

### 23.7 二次原创

点击二次原创：

```text
能把选中正文提交给 ChatGPT Web
能轮询拿到结果
能自动切段
能生成 contentBlocks
能保存 WebRewriteResult
```

### 23.8 导出

点击导出：

```text
Word 能正常导出
图片目录能正常导出
autoExportTaskBundle 能正常生成 result.docx 和 images/
```

---

## 24. 推荐开发顺序

```text
第 1 步：新增 OpenCliCommandRunner
第 2 步：新增 OpenCliOutputParser
第 3 步：新增 OpenCliRuntimeService
第 4 步：新增 IPC + preload：check/repair
第 5 步：WebToPostPage 顶部显示 OpenCLI 状态
第 6 步：新增 OpenCliBrowserService
第 7 步：新增 OpenCliWebLlmService，仅支持 chatgpt
第 8 步：新增 OpenCliImageDownloader
第 9 步：复制 WebTaskService 为 OpenCliWebTaskService
第 10 步：把 startCrawl 改成 OpenCLI 链路
第 11 步：把 collectRecordImages 改成 OpenCLI 链路
第 12 步：把 rewriteTask 改成 OpenCLI Web LLM 链路
第 13 步：IPC 根据 settings.runtime 切换服务
第 14 步：完整测试网页抓取 → 图片池 → 二次原创 → 导出
```

---

## 25. 关键提醒

这套方案本质上是“浏览器自动化访问 Web 大模型”，不是官方 API。

因此需要明确处理：

```text
登录失效
验证码
页面 UI 变化
模型额度限制
输出不稳定
同 profile 并发冲突
```

第一版重点是个人自用和内部工具，不要设计成高并发公共服务。

---

## 26. 给 Codex 的最终任务描述

请按本文档重构“网页转图文”功能：

```text
不要破坏现有 bb-browser 版本。
新增 OpenCLI 版本模块。
默认 runtime 使用 opencli。
页面功能保持和原来一致。
数据保存结构保持和原来一致。
只替换底层网页读取、图片提取、LLM 调用。
```

核心目标：

```text
网页读取：opencli browser
大模型：opencli chatgpt web adapter
健康检测：opencli doctor
修复：opencli daemon stop + opencli doctor
保存：沿用 WebCrawlTask / WebRewriteResult
导出：沿用现有 Word 导出逻辑
```
