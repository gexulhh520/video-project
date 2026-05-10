import axios from "axios";
import type { ArticleSection, ContentBlock, LlmSectionsResult, TranscriptSegment, WebRewriteResult } from "../types/app.types";
import { SettingsService } from "./settings.service";

type OpenAiLikeResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const SYSTEM_PROMPT = [
 "你是一个中文内容平台的爆款图文二创编辑，擅长把视频字幕、访谈内容、解说内容，重新加工成适合公众号、小红书、知乎等平台发布的原创图文内容。"+
 "你的任务不是逐句改写字幕，而是："+
 "先理解字幕的核心信息、情绪冲突、观点价值和信息差；"+
 "再重新选择切入角度；"+
 "最后用全新的结构和表达方式，写成一篇有传播力的中文图文稿。"+

 "【核心要求】"+

 "1. 必须深度重构内容"+
 "- 禁止逐句翻译、逐句改写、简单同义词替换。"+
 "- 不要按照原字幕的顺序机械复述。"+
 "- 要重新组织逻辑，可以调整顺序、合并观点、提炼重点、增加过渡和总结。" +
 "- 原字幕只是素材来源，最终内容要像一篇独立创作的文章。"+

 "2. 必须原创表达"+
 "- 禁止输出与原字幕高度相似的句子。"+
 "- 除人物名、品牌名、专业术语、英文概念、关键数据外，不要直接照搬原文表达。"+
 "- 同一个意思必须换成新的中文表达方式。"+
 "- 可以少量保留英文专业术语，但要用中文解释其含义。"+

 "3. 必须有爆款感"+
 "- 标题要有点击欲，具体、有冲突、有信息差、有情绪张力。"+
 "- 开头必须快速抓住读者，可以使用反常识、悬念、痛点、震撼观点或强情绪表达。"+
 "- 正文要有节奏感，不能像机器总结。"+
 "- 内容要有自己的理解，不只是复述别人说了什么。"+
 "4. 必须保持事实边界"+
 "- 不能编造字幕里没有的事实、数据、人物关系和结论。"+  
 "- 可以基于字幕内容做合理延展、解释和总结，但不能胡编。"+
 "- 如果字幕信息不完整，就只围绕已有信息进行分析。"+

 "5. 字数要求"+
 "- 总字数控制在 900 字以内。"+
 "- 语言自然，适合中文内容平台阅读。"+
 "- 不要输出创作过程，只输出最终成稿。"+
 "必须输出合法 JSON，不要附带解释、前言、后记或 Markdown 代码块。",+
 "每个 section 都必须包含 sourceTimeRanges，用来标记这段内容对应的视频时间范围。"
].join("");

function buildUserPrompt(segments: TranscriptSegment[]): string {
  return [
    "请基于下面的字幕 segments 输出 JSON。",
    "输出格式示例：",
    JSON.stringify(
      {
        title: "一个让人想点进去看的标题",
        sections: [
          {
            sectionId: "s1",
            paragraph: "适合图文发布的正文段落",
            sourceSegmentIds: ["seg_00001"],
            sourceTimeRanges: [
              {
                start: 0.5,
                end: 8.2,
                reason: "这一段主要讲了某个关键信息点"
              }
            ]
          }
        ]
      },
      null,
      2
    ),
    "",
    "请特别注意：",
    "1. title 要有传播感和点击欲，但不能浮夸失真。",
    "2. sections 要按内容逻辑拆分，不要拆得过碎。",
    "3. paragraph 要适合直接给用户阅读。",
    "4. sourceSegmentIds 和 sourceTimeRanges 要尽量准确对应。",
    "",
    "字幕 segments：",
    JSON.stringify(segments, null, 2)
  ].join("\n");
}

export class LlmService {
  private readonly baseUrl = process.env.LLM_BASE_URL;

  constructor(private readonly settingsService: SettingsService) {}

  async generateSectionsByLlm(segments: TranscriptSegment[]): Promise<LlmSectionsResult> {
    const content = await this.requestChatCompletion(
      [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildUserPrompt(segments)
        }
      ],
      {
        temperature: 0.7,
        response_format: {
          type: "json_object"
        }
      }
    );

    if (!content) {
      throw new Error("LLM returned an empty response.");
    }

    const parsed = JSON.parse(this.extractJson(content)) as LlmSectionsResult;
    if (!parsed.title || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      throw new Error("LLM response JSON is missing title or sections.");
    }

    parsed.sections = parsed.sections.map(this.normalizeSection);
    return parsed;
  }

  async rewriteParagraph(paragraph: string): Promise<string> {
    const normalizedParagraph = paragraph.trim();
    if (!normalizedParagraph) {
      throw new Error("Paragraph is empty.");
    }

    const content = await this.requestChatCompletion(
      [
        {
          role: "system",
          content: [
            "你是一个中文内容改写助手。",
            "你的任务是保留原意，重新组织表达，输出一版适合图文发布的新段落。",
            "禁止直接照抄原文，禁止只做少量替换。",
            "保持自然、流畅、可读，篇幅与原文接近。",
            "只输出改写后的正文，不要加标题、引号、解释或 Markdown。"
          ].join("")
        },
        {
          role: "user",
          content: `请把下面这段文字洗稿改写，保留核心意思，但换一种更自然、更像原创内容的说法：\n\n${normalizedParagraph}`
        }
      ],
      {
        temperature: 0.9
      }
    );

    const rewrittenParagraph = content.trim().replace(/^["“”]+|["“”]+$/g, "");
    if (!rewrittenParagraph) {
      throw new Error("LLM returned an empty rewritten paragraph.");
    }

    return rewrittenParagraph;
  }

  async extractArticleFromSnapshot(title: string, snapshot: string, prompt = ""): Promise<string> {
    if (!snapshot.trim()) {
      throw new Error("Snapshot is empty.");
    }

    const content = await this.requestChatCompletion(
      [
        {
          role: "system",
          content: [
            "你是中文网页正文抽取助手。",
            "你的任务是根据网页标题和网页快照，提取真正的文章正文。",
            "必须排除导航、页眉、页脚、作者信息、评论区、相关推荐、广告、按钮文案、标签、版权声明和重复内容。",
            "如果页面里存在多段正文，请按自然阅读顺序拼接成连贯正文。",
            "不要总结，不要改写，不要二创，只做清洗提取。",
            "只输出纯正文，不要带标题，不要带解释，不要带 Markdown。"
          ].join("")
        },
        {
          role: "user",
          content: [
            `标题：${title || "未获取到标题"}`,
            prompt.trim() ? `额外要求：${prompt.trim()}` : "",
            "网页快照如下：",
            snapshot
          ]
            .filter(Boolean)
            .join("\n\n")
        }
      ],
      {
        temperature: 0.2
      },
      "web"
    );

    const result = content.trim();
    if (!result) {
      throw new Error("LLM returned an empty extracted article.");
    }

    return result;
  }

  async rewriteWebContent(
    title: string,
    articles: Array<{ title: string; body: string }>,
    prompt: string
  ): Promise<WebRewriteResult> {
    if (articles.length === 0) {
      throw new Error("No confirmed articles to rewrite.");
    }

    const content = await this.requestChatCompletion(
      [
        {
          role: "system",
          content: [
            "你是一个中文平台爆款内容二创编辑。",
            "你会基于多个来源正文，重新组织信息，写出新的标题和多段原创正文。",
            "要保留事实边界，不虚构额外事实，不照抄原文句子。",
            "语言要自然、紧凑、适合图文发布。",
            "输出合法 JSON，不要附加解释。",
            "JSON 格式必须为 {\"title\":\"...\",\"paragraphs\":[\"...\" ]}。"
          ].join("")
        },
        {
          role: "user",
          content: [
            `任务标题：${title || "未命名任务"}`,
            prompt.trim() ? `额外要求：${prompt.trim()}` : "",
            "来源正文：",
            JSON.stringify(articles, null, 2)
          ]
            .filter(Boolean)
            .join("\n\n")
        }
      ],
      {
        temperature: 0.8,
        response_format: {
          type: "json_object"
        }
      },
      "web"
    );

    const parsed = JSON.parse(this.extractJson(content)) as {
      title?: string;
      paragraphs?: string[];
    };

    const paragraphs = (parsed.paragraphs ?? []).map((item) => item.trim()).filter(Boolean);
    if (!parsed.title?.trim() || paragraphs.length === 0) {
      throw new Error("LLM response JSON is missing title or paragraphs.");
    }

    const now = new Date().toISOString();
    const contentBlocks: ContentBlock[] = paragraphs.map((paragraph, index) => ({
      type: "paragraph",
      blockId: `web_p_${index + 1}`,
      sectionId: `web_s_${index + 1}`,
      text: paragraph
    }));

    return {
      title: parsed.title.trim(),
      paragraphs,
      contentBlocks,
      fullText: paragraphs.join("\n\n"),
      createdAt: now,
      updatedAt: now,
      prompt
    };
  }

  private extractJson(content: string): string {
    const fencedMatch = content.match(/```json\s*([\s\S]*?)```/i) ?? content.match(/```([\s\S]*?)```/i);
    return fencedMatch?.[1]?.trim() ?? content.trim();
  }

  private async requestChatCompletion(
    messages: Array<{ role: "system" | "user"; content: string }>,
    options?: {
      temperature?: number;
      response_format?: {
        type: "json_object";
      };
    },
    scope: "video" | "web" = "video"
  ): Promise<string> {
    const toolSettings =
      scope === "web" ? await this.settingsService.getWebToPostSettings() : await this.settingsService.getVideoToPostSettings();
    const apiKey = toolSettings.llmApiKey || process.env.LLM_API_KEY;
    const model = toolSettings.llmModel || process.env.LLM_MODEL || "deepseek-v4-flash";

    if (!this.baseUrl || !apiKey) {
      throw new Error("Missing LLM_BASE_URL or LLM_API_KEY.");
    }

    const response = await axios.post<OpenAiLikeResponse>(
      `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        model,
        temperature: options?.temperature ?? 0.7,
        response_format: options?.response_format,
        messages
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 120000
      }
    );

    return response.data.choices?.[0]?.message?.content?.trim() ?? "";
  }

  private normalizeSection(section: ArticleSection, index: number): ArticleSection {
    return {
      sectionId: section.sectionId || `s${index + 1}`,
      paragraph: section.paragraph?.trim() ?? "",
      sourceSegmentIds: section.sourceSegmentIds ?? [],
      sourceTimeRanges:
        section.sourceTimeRanges?.length > 0
          ? section.sourceTimeRanges.map((range) => ({
              start: Number(range.start ?? 0),
              end: Number(range.end ?? range.start ?? 0),
              reason: range.reason
            }))
          : [
              {
                start: 0,
                end: 0,
                reason: "未提供时间范围，已自动兜底。"
              }
            ]
    };
  }
}
