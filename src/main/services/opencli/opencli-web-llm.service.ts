import type {
  ContentBlock,
  OpenCliProvider,
  OpenCliProviderStatus,
  WebRewriteResult
} from "../../types/app.types";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOpenCliJson } from "./opencli-output-parser";
import { OpenCliCommandRunner } from "./opencli-command-runner";

type AskOptions = {
  provider: OpenCliProvider;
  profile: string;
  prompt: string;
  timeoutMs: number;
  intervalMs?: number;
};
type OpenCliReadMessage = {
  Index?: number;
  Role?: string;
  Text?: string;
};

type ExtractArticleOptions = {
  provider: OpenCliProvider;
  profile: string;
  title: string;
  body: string;
  userPrompt?: string;
  timeoutMs: number;
  intervalMs?: number;
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
const ARG_FILE_PREFIX = "__OPENCLI_ARG_FILE__:";

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
      intervalMs: options.intervalMs
    });

    const extracted = response.trim();
    if (!extracted) {
      throw new Error("OpenCLI Web 模型返回了空正文。");
    }

    return extracted;
  }

  async rewriteWebContent(options: RewriteWebContentOptions): Promise<WebRewriteResult> {
    if (!options.articles.length) {
      throw new Error("没有可用于二次创作的正文内容。");
    }

    const prompt = this.buildSingleLinePrompt([
      "你是专业中文爆款图文二创编辑。",
      "请基于输入素材，生成一篇新的原创图文稿。不要输出 JSON，不要输出解释、注释、Markdown。",
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
      intervalMs: options.intervalMs
    });

    const parsed = this.parseRewritePayload(response);
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
      await this.startNewChat(options.provider, normalizedProfile);
      await this.send(options.provider, normalizedProfile, options.prompt);
      return this.pollReadResult(
        options.provider,
        normalizedProfile,
        options.timeoutMs,
        Math.max(1500, options.intervalMs ?? 3000)
      );
    });
  }

  private async startNewChat(provider: OpenCliProvider, profile: string): Promise<void> {
    await this.runner.run(["--profile", profile, provider, "new"], {
      timeoutMs: 60000
    });
  }

  private async send(provider: OpenCliProvider, profile: string, prompt: string): Promise<void> {
    const normalizedPrompt = this.normalizePromptForTransport(prompt);
    const tempDir = await mkdtemp(join(tmpdir(), "opencli-prompt-"));
    const promptPath = join(tempDir, "prompt.txt");
    await writeFile(promptPath, normalizedPrompt, "utf8");

    try {
      await this.runner.run(["--profile", profile, provider, "send", `${ARG_FILE_PREFIX}${promptPath}`], {
        timeoutMs: 60000
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async pollReadResult(
    provider: OpenCliProvider,
    profile: string,
    timeoutMs: number,
    intervalMs: number
  ): Promise<string> {
    const startedAt = Date.now();
    let lastAssistant = "";
    let stableRounds = 0;

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      const messages = await this.readMessages(provider, profile);
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

      if (stableRounds >= 2) {
        return latestAssistant;
      }
    }

    if (lastAssistant) {
      return lastAssistant;
    }

    throw new Error("OpenCLI Web 模型响应超时，未读到稳定的 Assistant 输出。");
  }

  private async readMessages(provider: OpenCliProvider, profile: string): Promise<OpenCliReadMessage[]> {
    const result = await this.runner.run(["--profile", profile, provider, "read", "-f", "json"], {
      timeoutMs: 60000
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
    if (Array.isArray(payload)) {
      return payload.filter((item) => !!item && typeof item === "object") as OpenCliReadMessage[];
    }

    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (Array.isArray(record.data)) {
        return record.data.filter((item) => !!item && typeof item === "object") as OpenCliReadMessage[];
      }
      if (Array.isArray(record.rows)) {
        return record.rows.filter((item) => !!item && typeof item === "object") as OpenCliReadMessage[];
      }
      if (Array.isArray(record.messages)) {
        return record.messages.filter((item) => !!item && typeof item === "object") as OpenCliReadMessage[];
      }
    }

    return [];
  }

  private getLatestAssistantText(messages: OpenCliReadMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const role = String(messages[i].Role || "").toLowerCase();
      if (role !== "assistant") {
        continue;
      }
      const text = String(messages[i].Text || "").trim();
      if (!text) {
        continue;
      }
      if (/thinking|正在思考|生成中/i.test(text)) {
        continue;
      }
      return text;
    }

    return "";
  }

  private normalizePromptForTransport(prompt: string): string {
    return String(prompt || "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{2,}/g, " <段落分隔> ")
      .replace(/\n/g, " ")
      .replace(/"/g, "“")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  private buildSingleLinePrompt(parts: string[]): string {
    return parts
      .map((part) => this.normalizePromptForTransport(part))
      .filter(Boolean)
      .join(" ");
  }

  private parseRewritePayload(content: string): { title: string; paragraphs: string[] } {
    const raw = String(content || "").trim();
    if (!raw) {
      throw new Error("OpenCLI Web 模型返回结果为空。");
    }

    const cleaned = raw
      .replace(/^```[\w-]*\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const lines = cleaned
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error("OpenCLI Web 模型返回内容不足，无法还原标题和段落。");
    }

    const title = lines[0]
      .replace(/^(标题|title)\s*[:：]\s*/i, "")
      .trim();
    const paragraphs = lines
      .slice(1)
      .map((line) => line.replace(/^\d+[.)、]\s*/, "").trim())
      .filter(Boolean);

    if (!title || paragraphs.length === 0) {
      throw new Error("OpenCLI Web 模型返回结果缺少标题或段落。");
    }

    return { title, paragraphs };
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

