import { readFile } from "node:fs/promises";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { SettingsService } from "./settings.service";

type DoubaoUtterance = {
  text?: string;
  utterance?: string;
  start_time?: number;
  end_time?: number;
};

type DoubaoResponse = {
  code?: number;
  message?: string;
  utterances?: DoubaoUtterance[];
  result?: {
    utterances?: DoubaoUtterance[];
  };
};

export class DoubaoAsrService {
  private readonly baseUrl =
    process.env.DOUBAO_ASR_BASE_URL ?? "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
  private readonly resourceId = process.env.DOUBAO_ASR_RESOURCE_ID ?? "volc.bigasr.auc_turbo";
  private readonly uid = process.env.DOUBAO_UID ?? "video-to-post-user";

  constructor(private readonly settingsService: SettingsService) {}

  async recognizeMp3ByDoubao(audioPath: string): Promise<DoubaoUtterance[]> {
    const toolSettings = await this.settingsService.getVideoToPostSettings();
    const apiKey = toolSettings.doubaoAsrApiKey || process.env.DOUBAO_ASR_API_KEY;

    if (!apiKey) {
      throw new Error("Missing DOUBAO_ASR_API_KEY.");
    }

    const buffer = await readFile(audioPath);
    const requestId = uuidv4();
    const response = await axios.post<DoubaoResponse>(
      this.baseUrl,
      {
        user: {
          uid: this.uid
        },
        audio: {
          data: buffer.toString("base64"),
          format: "mp3"
        },
        request: {
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          show_utterances: true
        }
      },
      {
        headers: {
          "X-Api-Key": apiKey,
          "X-Api-Resource-Id": this.resourceId,
          "X-Api-Request-Id": requestId,
          "X-Api-Sequence": "-1",
          "Content-Type": "application/json"
        },
        timeout: 120000
      }
    );

    const utterances = response.data.result?.utterances ?? response.data.utterances ?? [];
    if (!utterances.length) {
      throw new Error(
        `Doubao ASR returned no utterances${response.data.message ? `: ${response.data.message}` : "."}`
      );
    }

    return utterances;
  }
}
