import axios from "axios";
import type { ArticleSection, LlmSectionsResult, TranscriptSegment } from "../types/app.types";
import { SettingsService } from "./settings.service";

type OpenAiLikeResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const SYSTEM_PROMPT = [
  "你是一个中文图文内容编辑助手，擅长把视频字幕整理成适合发布的图文草稿。",
  "请根据给定的字幕片段，输出适合中文内容平台发布的结构化图文内容。",
  "标题必须有吸引力，让人看到后会产生强烈点击欲，想点进去继续看。",
  "标题要具体、自然、有信息差或情绪张力，但不要低俗、不要夸张造假、不要写成纯标题党。",
  "正文要通顺、清晰，适合图文阅读，不要只是机械复述字幕。",
  "必须输出合法 JSON，不要附带解释、前言、后记或 Markdown 代码块。",
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
    const toolSettings = await this.settingsService.getVideoToPostSettings();
    const apiKey = toolSettings.llmApiKey || process.env.LLM_API_KEY;
    const model = toolSettings.llmModel || process.env.LLM_MODEL || "deepseek-v4-flash";

    if (!this.baseUrl || !apiKey) {
      throw new Error("Missing LLM_BASE_URL or LLM_API_KEY.");
    }

    const response = await axios.post<OpenAiLikeResponse>(
      `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        model,
        temperature: 0.7,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: buildUserPrompt(segments)
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 120000
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
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

  private extractJson(content: string): string {
    const fencedMatch = content.match(/```json\s*([\s\S]*?)```/i) ?? content.match(/```([\s\S]*?)```/i);
    return fencedMatch?.[1]?.trim() ?? content.trim();
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
