import axios from "axios";
import type { ArticleSection, LlmSectionsResult, TranscriptSegment } from "../types/app.types";

type OpenAiLikeResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export class LlmService {
  private readonly baseUrl = process.env.LLM_BASE_URL;
  private readonly apiKey = process.env.LLM_API_KEY;
  private readonly model = process.env.LLM_MODEL ?? "deepseek-chat";

  async generateSectionsByLlm(segments: TranscriptSegment[]): Promise<LlmSectionsResult> {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error("Missing LLM_BASE_URL or LLM_API_KEY.");
    }

    const response = await axios.post<OpenAiLikeResponse>(
      `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        model: this.model,
        temperature: 0.7,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content:
              "你是一个图文编辑助手。请根据给定字幕片段，生成适合中文图文平台发布的结果。必须输出合法 JSON，不要附带解释。每个 section 都必须含有 sourceTimeRanges。"
          },
          {
            role: "user",
            content: [
              "请基于下面的字幕片段，输出 JSON：",
              JSON.stringify(
                {
                  title: "标题",
                  sections: [
                    {
                      sectionId: "s1",
                      paragraph: "正文段落",
                      sourceSegmentIds: ["seg_00001"],
                      sourceTimeRanges: [
                        {
                          start: 0.5,
                          end: 8.2,
                          reason: "这一段介绍主题"
                        }
                      ]
                    }
                  ]
                },
                null,
                2
              ),
              "",
              "字幕 segments：",
              JSON.stringify(segments, null, 2)
            ].join("\n")
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
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
                reason: "未提供时间范围，已自动兜底"
              }
            ]
    };
  }
}
