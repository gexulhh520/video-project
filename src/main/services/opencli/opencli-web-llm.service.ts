import type {
  ContentBlock,
  OpenCliProvider,
  OpenCliProviderStatus,
  WebRewriteResult
} from "../../types/app.types";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseOpenCliJson, parseOpenCliModelJson } from "./opencli-output-parser";
import { OpenCliCommandRunner } from "./opencli-command-runner";

type AskOptions = {
  provider: OpenCliProvider;
  profile: string;
  prompt: string;
  timeoutMs: number;
  intervalMs?: number;
  workingDir?: string;
  acceptResponse?: (text: string) => boolean;
  preserveUrls?: boolean;
};
type OpenCliReadMessage = {
  Index?: number;
  Role?: string;
  Text?: string;
  [key: string]: unknown;
};

type ExtractArticleOptions = {
  provider: OpenCliProvider;
  profile: string;
  title: string;
  body: string;
  userPrompt?: string;
  timeoutMs: number;
  intervalMs?: number;
  workingDir?: string;
};

type ExtractArticleFromUrlOptions = {
  provider: OpenCliProvider;
  profile: string;
  url: string;
  userPrompt?: string;
  timeoutMs: number;
  intervalMs?: number;
  workingDir?: string;
};

type RewriteWebContentOptions = {
  provider: OpenCliProvider;
  profile: string;
  title: string;
  articles: Array<{ title: string; body: string }>;
  prompt: string;
  sourceRecordIds: string[];
  timeoutMs: number;
  intervalMs?: number;
  workingDir?: string;
};

const PROVIDER_LOGIN_URLS: Record<OpenCliProvider, string> = {
  chatgpt: "https://chatgpt.com",
  gemini: "https://gemini.google.com",
  claude: "https://claude.ai",
  grok: "https://grok.com",
  doubao: "https://www.doubao.com",
  yuanbao: "https://yuanbao.tencent.com"
};

const CONNECTION_TEST_PROMPT = "请只回复：连接成功";
const DEFAULT_EXTRACT_PROMPT =
  "请提取网页正文，删除导航、广告、评论、页脚、推荐内容和无关信息，只输出清洗后的正文。";
const DEFAULT_EXTRACT_FROM_URL_PROMPT =
  "你是网页正文提取助手。请打开并读取下面这个链接，提取文章标题和完整正文。只保留标题、作者或来源、发布时间和正文段落，删除导航、广告、评论、推荐阅读、版权声明、登录提示和无关按钮文案。如果无法访问或没有正文，请输出空 body 并说明 reason。";
const ARG_FILE_PREFIX = "__OPENCLI_ARG_FILE__:";
const OPENCLI_PROMPT_DEBUG_DIR = ".cache/opencli-prompts";
const MAX_REWRITE_TITLE_LENGTH = 40;

class OpenCliProfileLock {
  private readonly locks = new Map<string, Promise<void>>();

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

export class OpenCliWebLlmService {
  private readonly profileLock = new OpenCliProfileLock();

  constructor(private readonly runner: OpenCliCommandRunner) {}

  async openProviderLoginPage(provider: OpenCliProvider, profile: string): Promise<void> {
    const normalizedProfile = profile.trim();
    if (!normalizedProfile) {
      throw new Error("缺少 OpenCLI Profile，无法打开登录页面。");
    }

    const url = PROVIDER_LOGIN_URLS[provider] ?? PROVIDER_LOGIN_URLS.chatgpt;
    await this.runner.run(["--profile", normalizedProfile, "browser", "llm_login", "open", url], {
      timeoutMs: 60000
    });
  }

  async testProvider(
    provider: OpenCliProvider,
    profile: string,
    timeoutMs = 120000,
    intervalMs = 3000
  ): Promise<OpenCliProviderStatus> {
    try {
      const response = await this.askOnce({
        provider,
        profile,
        prompt: CONNECTION_TEST_PROMPT,
        timeoutMs,
        intervalMs
      });

      const normalized = response.replace(/\s+/g, "");
      const ready = normalized.includes("连接成功");
      return {
        provider,
        profile,
        ready,
        message: ready ? "测试成功：连接成功" : `测试返回：${response.slice(0, 80)}`,
        rawOutput: response
      };
    } catch (error) {
      return {
        provider,
        profile,
        ready: false,
        message: error instanceof Error ? error.message : "测试失败"
      };
    }
  }

  async extractArticleFromBody(options: ExtractArticleOptions): Promise<string> {
    const userPrompt = options.userPrompt?.trim() || DEFAULT_EXTRACT_PROMPT;
    const prompt = this.buildSingleLinePrompt([
      userPrompt,
      `网页标题：${options.title || "未获取到标题"}`,
      `网页内容：${options.body || "未获取到正文"}`
    ]);

    const response = await this.askOnce({
      provider: options.provider,
      profile: options.profile,
      prompt,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
      workingDir: options.workingDir
    });

    const extracted = response.trim();
    if (!extracted) {
      throw new Error("OpenCLI Web 模型返回了空正文。");
    }

    return extracted;
  }

  async extractArticleFromUrl(
    options: ExtractArticleFromUrlOptions
  ): Promise<{ title: string; body: string; confidence?: number; reason?: string }> {
    const targetUrl = String(options.url || "").trim();
    if (!targetUrl) {
      throw new Error("URL 不能为空。");
    }

    const userPrompt = options.userPrompt?.trim() || DEFAULT_EXTRACT_FROM_URL_PROMPT;
    const prompt = this.buildSingleLinePrompt([
      userPrompt,
      "必须输出严格 JSON：{\"title\": string, \"body\": string, \"confidence\": number, \"reason\": string}",
      `URL: ${targetUrl}`
    ], true);

    const response = await this.askOnce({
      provider: options.provider,
      profile: options.profile,
      prompt,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
      workingDir: options.workingDir,
      preserveUrls: true
    });

    const parsed = parseOpenCliModelJson<Record<string, unknown>>(response);
    const title = String(parsed.title || "").trim();
    const body = String(parsed.body || "").trim();
    const reason = String(parsed.reason || "").trim() || undefined;
    const confidence = Number(parsed.confidence);
    return {
      title,
      body,
      confidence: Number.isFinite(confidence) ? confidence : undefined,
      reason
    };
  }

  async askByProvider(options: AskOptions): Promise<string> {
    return this.askOnce(options);
  }

  async rewriteWebContent(options: RewriteWebContentOptions): Promise<WebRewriteResult> {
    if (!options.articles.length) {
      throw new Error("没有可用于二次创作的正文内容。");
    }

    const prompt = this.buildSingleLinePrompt([
      "你是专业中文爆款图文二创编辑。",
      "请基于输入素材，生成一篇新的原创图文稿。不要输出 JSON，不要输出解释、注释、Markdown。",
      "禁止将生成内容放入任何文档、附件、下载链接或文件中，只能直接在回复正文中输出结果。",
      "标题必须放在回复最开头，第一行只能是标题，标题前不能出现任何说明文字、符号或空行。",
      "标题行末尾必须换行，正文必须从下一行开始输出，不得与标题同行。",
      "输出格式要求：第一行仅输出标题；从第二行开始每行一个正文段落，段落之间不要编号，不要项目符号，不要空洞过渡语。",
      "核心目标：在不改变事实、不编造信息的前提下，把素材改写成一篇适合公众号发布的原创爆款图文稿。文章要有传播感、阅读欲和完整逻辑，而不是简单复述原文。",
      "标题要求：1. 标题要有钩子，有点击欲，但不能夸大事实。2. 可使用以下方式制造吸引力：悬念式（先抛出一个问题，引导读者继续看）；反差式（先写传言，再写官方数据形成反差）；冲突式（突出自媒体说法与官方回应之间的不同）；结果式（先写热搜结果，再倒推事件经过）；情绪式（用网友关心的问题切入，但不得煽动）。3. 标题不要使用低俗、惊悚、虚假、夸大表达。",
      "正文要求：1. 第一段必须有强钩子，用一个冲突、疑问、反差或悬念切入，吸引读者继续看。2. 正文要适合公众号发布，语言自然，有开头、有背景、有分析、有总结。3. 文章结构建议采用：钩子开头 → 争议出现 → 官方回应 → 数据支撑 → 事件分析 → 总结判断。4. 必须保留素材中的核心事实、时间、数据、机构、事件结果，不得编造新事实。5. 不要逐句改写原文，不要按原文顺序机械复述。6. 降低与原文的文字相似度：除时间、数字、专有名词外，避免连续复用原文超过 8 个字；避免重复原文句式；避免只做同义词替换；对原文信息进行合并、拆分、转述和重排。7. 对事实性内容要谨慎表达，例如使用“据横店方面公布”“官方回应显示”“从现有信息看”等表达。8. 结尾要有观点总结，但观点必须基于素材，不得过度引申。",
      "内部自检：生成前请检查文章是否具备：1. 标题钩子；2. 开头钩子；3. 事实完整；4. 结构不同于原文；5. 相似度较低。最终不要输出自检过程。",
      `用户附加要求：${options.prompt.trim() || "无"}`,
      `素材标题：${options.title || "网页转图文任务"}`,
      `素材正文：${this.buildArticleSourceText(options.articles)}`
    ]);

    const response = await this.askOnce({
      provider: options.provider,
      profile: options.profile,
      prompt,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
      workingDir: options.workingDir
    });

    const parsed = this.parseRewritePayload(response, options.title);
    const now = new Date().toISOString();
    const contentBlocks: ContentBlock[] = parsed.paragraphs.map((paragraph, index) => ({
      type: "paragraph",
      blockId: `web_p_${index + 1}`,
      sectionId: `web_s_${index + 1}`,
      text: paragraph
    }));

    return {
      title: parsed.title,
      paragraphs: parsed.paragraphs,
      contentBlocks,
      fullText: parsed.paragraphs.join("\n\n"),
      createdAt: now,
      updatedAt: now,
      prompt: options.prompt,
      sourceRecordIds: options.sourceRecordIds
    };
  }

  private async askOnce(options: AskOptions): Promise<string> {
    const normalizedProfile = options.profile.trim();
    if (!normalizedProfile) {
      throw new Error("缺少 OpenCLI Profile。");
    }

    return this.profileLock.runExclusive(normalizedProfile, async () => {
      await this.startNewChat(options.provider, normalizedProfile, options.workingDir);
      await this.send(options.provider, normalizedProfile, options.prompt, options.workingDir, options.preserveUrls);
      return this.pollReadResult(
        options.provider,
        normalizedProfile,
        options.timeoutMs,
        Math.max(1500, options.intervalMs ?? 3000),
        options.workingDir,
        options.acceptResponse
      );
    });
  }

  private async startNewChat(provider: OpenCliProvider, profile: string, workingDir?: string): Promise<void> {
    await this.runner.run(["--profile", profile, provider, "new"], {
      timeoutMs: 60000,
      cwd: workingDir
    });
  }

  private async send(
    provider: OpenCliProvider,
    profile: string,
    prompt: string,
    workingDir?: string,
    preserveUrls = false
  ): Promise<void> {
    const normalizedPrompt = prompt; // normalizePromptForTransport commented out
    const debugPromptPath = await this.writeDebugPrompt(normalizedPrompt, workingDir);
    const tempBaseDir = join(workingDir || process.cwd(), OPENCLI_PROMPT_DEBUG_DIR, "tmp");
    await mkdir(tempBaseDir, { recursive: true });
    const tempDir = await mkdtemp(join(tempBaseDir, "opencli-prompt-"));
    const promptPath = join(tempDir, "prompt.txt");
    await writeFile(promptPath, normalizedPrompt, "utf8");

    try {
      await this.runner.run(["--profile", profile, provider, "send", `${ARG_FILE_PREFIX}${promptPath}`], {
        timeoutMs: 60000,
        cwd: workingDir
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`${msg}\nOpenCLI prompt debug file: ${debugPromptPath}`);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async pollReadResult(
    provider: OpenCliProvider,
    profile: string,
    timeoutMs: number,
    intervalMs: number,
    workingDir?: string,
    acceptResponse?: (text: string) => boolean
  ): Promise<string> {
    const startedAt = Date.now();
    let lastAssistant = "";
    let stableRounds = 0;
    let lastJsonNormalized = "";
    let lastJsonRaw = "";
    let jsonStableRounds = 0;
    let lastJsonChangedAt = 0;
    const minJsonSettleMs = Math.max(intervalMs * 3, 6000);

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      let messages: OpenCliReadMessage[] = [];
      try {
        messages = await this.readMessages(provider, profile, workingDir);
        console.log("Messages:", JSON.stringify(messages, null, 2));
      } catch {
        // Ignore readMessages errors and continue polling
      }
      const latestAssistant = this.getLatestAssistantText(messages);
      if (!latestAssistant) {
        continue;
      }

      if (latestAssistant === lastAssistant) {
        stableRounds += 1;
      } else {
        lastAssistant = latestAssistant;
        stableRounds = 0;
      }

      // JSON responses may evolve in-place across polling rounds.
      // Return only when the parsed JSON payload is stable for multiple rounds
      // and remains unchanged for a short settle window.
      const normalizedJson = this.normalizeJsonText(latestAssistant);
      if (normalizedJson) {
        if (normalizedJson === lastJsonNormalized) {
          console.log("normalizedJson === lastJsonNormalized:", normalizedJson === lastJsonNormalized, "jsonStableRounds:", jsonStableRounds, "lastJsonNormalized:", lastJsonNormalized);
          jsonStableRounds += 1;
          const settled = Date.now() - lastJsonChangedAt >= minJsonSettleMs;
          if (jsonStableRounds >= 2 && stableRounds >= 2 && settled) {
            return latestAssistant;
          }
        } else {
          lastJsonNormalized = normalizedJson;
          jsonStableRounds = 0;
          lastJsonChangedAt = Date.now();
        }
        lastJsonRaw = latestAssistant;
        continue;
      }

      if (stableRounds >= 2) {
        if (acceptResponse && !acceptResponse(latestAssistant)) {
          continue;
        }
        return latestAssistant;
      }
    }

    if (lastJsonRaw) {
      return lastJsonRaw;
    }

    if (lastAssistant) {
      return lastAssistant;
    }

    throw new Error("OpenCLI Web 模型响应超时，未读到稳定的 Assistant 输出。");
  }

  private async readMessages(
    provider: OpenCliProvider,
    profile: string,
    workingDir?: string
  ): Promise<OpenCliReadMessage[]> {
    const result = await this.runner.run(["--profile", profile, provider, "read", "-f", "json"], {
      timeoutMs: 60000,
      cwd: workingDir
    });
    const payloadText = `${result.stdout}\n${result.stderr}`.trim();
    if (!payloadText) {
      return [];
    }

    try {
      const parsed = parseOpenCliJson<unknown>(payloadText);
      return this.extractMessages(parsed);
    } catch {
      return [];
    }
  }

  private extractMessages(payload: unknown): OpenCliReadMessage[] {
    return this.collectMessageCandidates(payload);
  }

  private getLatestAssistantText(messages: OpenCliReadMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const role = String(messages[i].Role || "").toLowerCase();
      if (!role.includes("assistant")) {
        continue;
      }
      const text = String(messages[i].Text || "").trim();
      if (!text) {
        continue;
      }
      if (/thinking|正在思考|思考中/i.test(text)) {
        continue;
      }
      return text;
    }

    return "";
  }

  private collectMessageCandidates(payload: unknown, depth = 0): OpenCliReadMessage[] {
    if (depth > 6 || payload == null) {
      return [];
    }

    if (Array.isArray(payload)) {
      return payload.flatMap((item) => this.collectMessageCandidates(item, depth + 1));
    }

    if (typeof payload !== "object") {
      return [];
    }

    const normalized = this.normalizeMessageCandidate(payload as Record<string, unknown>);
    if (normalized) {
      return [normalized];
    }

    const record = payload as Record<string, unknown>;
    const nestedKeys = [
      "data",
      "rows",
      "messages",
      "items",
      "results",
      "events",
      "output",
      "conversation",
      "history"
    ];
    const nestedValues = nestedKeys
      .map((key) => record[key] ?? record[key.toLowerCase()] ?? record[key.toUpperCase()])
      .filter((value) => value != null);

    return nestedValues.flatMap((value) => this.collectMessageCandidates(value, depth + 1));
  }

  private normalizeMessageCandidate(value: Record<string, unknown>): OpenCliReadMessage | null {
    const role = this.pickFirstString(value, ["Role", "role", "senderRole", "sender_role", "type"]);
    const text = this.extractMessageText(value);

    if (!role || !text) {
      return null;
    }

    return {
      Index: Number(value.Index ?? value.index ?? 0) || undefined,
      Role: role,
      Text: text
    };
  }

  private extractMessageText(value: Record<string, unknown>): string {
    const direct = this.pickFirstString(value, ["Text", "text", "message", "Message", "content", "Content"]);
    if (direct) {
      return direct.trim();
    }

    const content = value.content ?? value.Content;
    if (Array.isArray(content)) {
      const fragments = content
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (!item || typeof item !== "object") {
            return "";
          }
          const record = item as Record<string, unknown>;
          return this.pickFirstString(record, ["text", "Text", "value", "content", "Content"]) || "";
        })
        .map((item) => item.trim())
        .filter(Boolean);
      return fragments.join("\n").trim();
    }

    return "";
  }

  private pickFirstString(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    return "";
  }

  private normalizeJsonText(text: string): string {
    const normalized = String(text || "").trim();
    if (!normalized) {
      return "";
    }

    try {
      //const parsed = parseOpenCliModelJson(normalized);
      return JSON.stringify(normalized);
    } catch {
      return "";
    }
  }

  private async writeDebugPrompt(prompt: string, workingDir?: string): Promise<string> {
    const dir = join(workingDir || process.cwd(), OPENCLI_PROMPT_DEBUG_DIR);
    await mkdir(dir, { recursive: true });
    const fileName = `prompt-${Date.now()}.txt`;
    const path = join(dir, fileName);
    await writeFile(path, prompt, { encoding: "utf8", flag: "w" });
    return path;
  }

  private normalizePromptForTransport(prompt: string, preserveUrls = false): string {
    const text = String(prompt || "");
    const withoutUrlMarkdown = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1");
    const strippedUrls = preserveUrls
      ? withoutUrlMarkdown
      : withoutUrlMarkdown
          .replace(/https?:\/\/[^\s]+/gi, " ")
          .replace(/www\.[^\s]+/gi, " ");

    return strippedUrls
      .replace(/\r\n/g, "\n")
      .replace(/\n{2,}/g, " <段落分隔> ")
      .replace(/\n/g, " ")
      .replace(/"/g, "“")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  private buildSingleLinePrompt(parts: string[], preserveUrls = false): string {
    return parts
      .map((part) => this.normalizePromptForTransport(part, preserveUrls))
      .filter(Boolean)
      .join(" ");
  }

  private parseRewritePayload(content: string, fallbackTitle?: string): { title: string; paragraphs: string[] } {
    const raw = String(content || "").trim();
    if (!raw) {
      throw new Error("OpenCLI Web 模型返回结果为空。");
    }

    const cleaned = raw
      .replace(/^```[\w-]*\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const jsonParsed = this.tryParseRewriteJson(cleaned);
    if (jsonParsed) {
      return jsonParsed;
    }

    const lines = cleaned
      .split(/\r?\n/)
      .map((line) => line.replace(/^#{1,6}\s*/, "").trim())
      .filter(Boolean);
    const firstLineRaw = lines[0] || "";
    const firstLineTitleOnly = firstLineRaw.replace(/^(标题|title)\s*[:：]\s*/i, "").trim();
    const titleBodySplit =
      firstLineTitleOnly.match(/^(.{3,60}?)[。！？!?：:]\s+(.+)$/) ||
      firstLineTitleOnly.match(/^(.{3,60}?)\s+(.+)$/);
    const extractedTitle = titleBodySplit ? titleBodySplit[1].trim() : firstLineTitleOnly;

    let paragraphs = lines
      .slice(1)
      .map((line) => line.replace(/^\d+[.)、]\s*/, "").trim())
      .filter(Boolean);

    if (titleBodySplit?.[2]?.trim()) {
      paragraphs.unshift(titleBodySplit[2].trim());
    }

    // Fallback: some providers return one long block instead of line-split output.
    if (paragraphs.length === 0) {
      const bodyText = lines.join(" ").replace(/^标题\s*[:：]\s*/i, "").trim();
      paragraphs = this.splitBodyIntoParagraphs(bodyText);
    }

    paragraphs = this.normalizeParagraphs(paragraphs);

    if (paragraphs.length === 0) {
      throw new Error("OpenCLI Web 模型返回内容不足，未解析出正文段落。");
    }

    const title = this.limitTitleLength(extractedTitle || this.buildFallbackTitle(fallbackTitle, paragraphs[0]));
    return { title, paragraphs };
  }

  private tryParseRewriteJson(raw: string): { title: string; paragraphs: string[] } | null {
    try {
      const parsed = parseOpenCliJson<unknown>(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      const record = parsed as Record<string, unknown>;
      const title = String(record.title || "").trim();
      const paragraphs = Array.isArray(record.paragraphs)
        ? record.paragraphs.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      if (!title || paragraphs.length === 0) {
        return null;
      }
      return { title, paragraphs };
    } catch {
      return null;
    }
  }

  private splitBodyIntoParagraphs(text: string): string[] {
    const normalized = String(text || "")
      .replace(/<段落分隔>/g, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (!normalized) {
      return [];
    }

    // Handle numbered sections returned in one line: 1. ... 2. ...
    const numbered = normalized
      .replace(/([。！？!?])\s*(?=\d+[.)、]\s*)/g, "$1\n")
      .split(/\s*(?=\d+[.)、]\s*)/)
      .map((item) => item.replace(/^\d+[.)、]\s*/, "").trim())
      .filter(Boolean);
    if (numbered.length >= 2) {
      return numbered;
    }

    const blocks = normalized
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (blocks.length >= 2) {
      return blocks;
    }

    const sentences = normalized
      .split(/(?<=[。！？!?])/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (sentences.length <= 1) {
      return [normalized];
    }

    const targetGroups = Math.min(4, Math.max(2, Math.ceil(sentences.length / 2)));
    const perGroup = Math.ceil(sentences.length / targetGroups);
    const result: string[] = [];
    for (let i = 0; i < sentences.length; i += perGroup) {
      const chunk = sentences.slice(i, i + perGroup).join("");
      if (chunk.trim()) {
        result.push(chunk.trim());
      }
    }
    return result;
  }

  private normalizeParagraphs(paragraphs: string[]): string[] {
    const cleaned = paragraphs
      .map((item) =>
        String(item || "")
          .replace(/<段落分隔>/g, "\n")
          .replace(/[ \t]+/g, " ")
          .trim()
      )
      .filter(Boolean);

    if (cleaned.length >= 2) {
      return cleaned;
    }

    const only = cleaned[0] || "";
    if (!only) {
      return [];
    }

    // If only one giant paragraph remains, re-split for readability.
    if (only.length > 120) {
      return this.splitBodyIntoParagraphs(only);
    }

    return [only];
  }

  private buildFallbackTitle(candidateTitle: string | undefined, firstParagraph: string): string {
    const preferred = String(candidateTitle || "").trim();
    if (preferred) {
      return this.limitTitleLength(preferred);
    }

    const source = String(firstParagraph || "").replace(/\s+/g, " ").trim();
    if (!source) {
      return "二次原创稿";
    }
    const compact = source.length > MAX_REWRITE_TITLE_LENGTH ? source.slice(0, MAX_REWRITE_TITLE_LENGTH) : source;
    return this.limitTitleLength(compact);
  }

  private limitTitleLength(title: string): string {
    const normalized = String(title || "").trim();
    if (!normalized) {
      return "";
    }
    return normalized.length > MAX_REWRITE_TITLE_LENGTH ? normalized.slice(0, MAX_REWRITE_TITLE_LENGTH) : normalized;
  }

  private buildArticleSourceText(articles: Array<{ title: string; body: string }>): string {
    return articles
      .map((article, index) =>
        [
          `素材${index + 1}标题：${article.title || "未命名"}`,
          `素材${index + 1}正文：${article.body || "无正文"}`
        ].join(" ")
      )
      .join(" ");
  }
}

