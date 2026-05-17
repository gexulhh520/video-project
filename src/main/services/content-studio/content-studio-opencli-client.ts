import type { OpenCliProvider } from "../../types/app.types";
import { OpenCliWebLlmService } from "../opencli/opencli-web-llm.service";

export type ContentStudioAskOptions = {
  provider: OpenCliProvider;
  profile: string;
  prompt: string;
  timeoutMs: number;
  intervalMs: number;
};

export class ContentStudioOpenCliClient {
  constructor(private readonly openCliWebLlmService: OpenCliWebLlmService) {}

  async ask(options: ContentStudioAskOptions): Promise<string> {
    return this.openCliWebLlmService.askByProvider({
      provider: options.provider,
      profile: options.profile,
      prompt: options.prompt,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs
    });
  }
}
