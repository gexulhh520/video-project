import { OpenCliCommandRunner, OpenCliCommandResult } from "./opencli-command-runner";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { parseOpenCliJson } from "./opencli-output-parser";

export type OpenCliImageCandidate = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

type OpenCliExtractPayload = {
  content?: string;
  next_start_char?: number | null;
};

export class OpenCliBrowserService {
  constructor(private readonly runner: OpenCliCommandRunner) {}

  async open(profile: string, sessionName: string, url: string, workingDir?: string): Promise<void> {
    await this.runBrowserCommand(
      profile,
      [
        [sessionName, "open", url],
        ["open", url]
      ],
      60000,
      false,
      workingDir
    );
  }

  async wait(profile: string, sessionName: string, seconds: number, workingDir?: string): Promise<void> {
    await this.runBrowserCommand(
      profile,
      [
        [sessionName, "wait", "time", String(seconds)],
        ["wait", "time", String(seconds)]
      ],
      Math.max(10000, seconds * 1000 + 5000),
      false,
      workingDir
    );
  }

  async getTitle(profile: string, sessionName: string, workingDir?: string): Promise<string> {
    const result = await this.runBrowserCommand(
      profile,
      [
        [sessionName, "get", "title"],
        ["get", "title"]
      ],
      30000,
      false,
      workingDir
    );

    return result.stdout.trim();
  }

  async extract(
    profile: string,
    sessionName: string,
    sourceUrl: string,
    chunkSize = 8000,
    workingDir?: string
  ): Promise<string> {
    // Preferred: one-shot page read per official docs (`opencli web read --url ...`).
    const webReadText = await this.readViaWebRead(profile, sourceUrl, workingDir);
    if (webReadText.trim()) {
      return webReadText.trim();
    }

    // Fallback: browser extract with chunk stitching.
    return this.extractViaBrowser(profile, sessionName, chunkSize, workingDir);
  }

  async collectImageUrls(profile: string, sessionName: string, workingDir?: string): Promise<OpenCliImageCandidate[]> {
    const js =
      "(() => JSON.stringify(Array.from(document.images).map((img) => ({ src: img.currentSrc || img.src || '', alt: img.alt || '', width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 })).filter((item) => item.src && item.width >= 120 && item.height >= 120)))()";

    const result = await this.runBrowserCommand(
      profile,
      [
        [sessionName, "eval", js],
        ["eval", js]
      ],
      60000,
      false,
      workingDir
    );

    return this.parseImageCandidates(result);
  }

  async close(profile: string, sessionName: string, workingDir?: string): Promise<void> {
    await this.runBrowserCommand(
      profile,
      [
        [sessionName, "close"],
        ["close"]
      ],
      15000,
      true,
      workingDir
    );
  }

  private async readViaWebRead(profile: string, sourceUrl: string, workingDir?: string): Promise<string> {
    const commandCandidates = [
      ["--profile", profile, "web", "read", "--url", sourceUrl, "--wait-until", "networkidle", "-f", "json"],
      ["--profile", profile, "web", "read", "--url", sourceUrl, "-f", "json"],
      ["--profile", profile, "web", "read", "--url", sourceUrl]
    ];

    for (const args of commandCandidates) {
      const result = await this.runner.run(args, {
        timeoutMs: 120000,
        ignoreError: true,
        cwd: workingDir
      });
      if (result.code !== 0 && !result.stdout.trim()) {
        continue;
      }

      const merged = `${result.stdout}\n${result.stderr}`.trim();
      const extracted = await this.extractTextFromWebRead(merged, workingDir);
      if (extracted.trim()) {
        return extracted;
      }
    }

    return "";
  }

  private async extractTextFromWebRead(raw: string, workingDir?: string): Promise<string> {
    if (!raw.trim()) return "";
    try {
      const parsed = parseOpenCliJson<unknown>(raw);
      const text = this.pickContent(parsed);
      if (text) return text;

      const savedText = await this.readSavedArticleFile(parsed, workingDir);
      if (savedText) return savedText;
    } catch {
      // Fall back to raw text.
    }

    return raw.trim();
  }

  private async readSavedArticleFile(payload: unknown, workingDir?: string): Promise<string> {
    const savedPath = this.pickSavedPath(payload);
    if (!savedPath) {
      return "";
    }

    try {
      const resolvedPath = isAbsolute(savedPath) ? savedPath : resolve(workingDir || process.cwd(), savedPath);
      return (await readFile(resolvedPath, "utf8")).trim();
    } catch {
      return "";
    }
  }

  private async extractViaBrowser(
    profile: string,
    sessionName: string,
    chunkSize: number,
    workingDir?: string
  ): Promise<string> {
    let startChar: number | null = 0;
    let round = 0;
    const pieces: string[] = [];

    while (round < 12 && startChar !== null) {
      const result = await this.runBrowserCommand(
        profile,
        startChar > 0
          ? [
              [sessionName, "extract", "--chunk-size", String(chunkSize), "--start", String(startChar)],
              ["extract", "--chunk-size", String(chunkSize), "--start", String(startChar)]
            ]
          : [
              [sessionName, "extract", "--chunk-size", String(chunkSize)],
              ["extract", "--chunk-size", String(chunkSize)]
            ],
        90000
        ,
        false,
        workingDir
      );

      const payload = this.parseExtractPayload(result);
      if (payload.content?.trim()) {
        pieces.push(payload.content.trim());
      }

      if (typeof payload.next_start_char === "number" && payload.next_start_char > startChar) {
        startChar = payload.next_start_char;
      } else {
        startChar = null;
      }

      round += 1;
    }

    return pieces.join("\n");
  }

  private parseExtractPayload(result: OpenCliCommandResult): OpenCliExtractPayload {
    const raw = `${result.stdout}\n${result.stderr}`.trim();
    if (!raw) return {};

    try {
      const parsed = parseOpenCliJson<unknown>(raw);
      const content = this.pickContent(parsed);
      const next = this.pickNumberByKeys(parsed, ["next_start_char", "nextStartChar"]);
      return {
        content,
        next_start_char: next
      };
    } catch {
      return {
        content: raw
      };
    }
  }

  private parseImageCandidates(result: OpenCliCommandResult): OpenCliImageCandidate[] {
    const raw = `${result.stdout}\n${result.stderr}`.trim();
    if (!raw) {
      return [];
    }

    try {
      const parsed = parseOpenCliJson<unknown>(raw);
      if (Array.isArray(parsed)) {
        return this.normalizeImageCandidates(parsed);
      }
    } catch {
      // Keep trying fallback candidates below.
    }

    const candidate = this.extractJsonArrayCandidate(raw);
    if (!candidate) {
      return [];
    }

    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return this.normalizeImageCandidates(parsed);
      }
    } catch {
      return [];
    }

    return [];
  }

  private extractJsonArrayCandidate(raw: string): string | null {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start >= 0 && end > start) {
      return raw.slice(start, end + 1);
    }
    return null;
  }

  private normalizeImageCandidates(items: unknown[]): OpenCliImageCandidate[] {
    return items
      .map((item) => this.toImageCandidate(item))
      .filter((item): item is OpenCliImageCandidate => Boolean(item));
  }

  private toImageCandidate(item: unknown): OpenCliImageCandidate | null {
    if (!item || typeof item !== "object") {
      return null;
    }

    const record = item as Record<string, unknown>;
    const src = String(record.src || "").trim();
    const alt = String(record.alt || "").trim();
    const width = Number(record.width || 0);
    const height = Number(record.height || 0);
    if (!src || !Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }

    return {
      src,
      alt,
      width,
      height
    };
  }

  private pickContent(value: unknown): string {
    if (typeof value === "string") {
      return value.trim();
    }

    if (!value || typeof value !== "object") {
      return "";
    }

    const record = value as Record<string, unknown>;
    const directKeys = ["content", "text", "markdown", "body"];
    for (const key of directKeys) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    const nestedKeys = ["data", "result", "payload"];
    for (const key of nestedKeys) {
      const nested = record[key];
      const nestedContent = this.pickContent(nested);
      if (nestedContent) {
        return nestedContent;
      }
    }

    return "";
  }

  private pickNumberByKeys(value: unknown, keys: string[]): number | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
    }

    for (const nestedKey of ["data", "result", "payload"]) {
      const nested = record[nestedKey];
      const nestedValue = this.pickNumberByKeys(nested, keys);
      if (typeof nestedValue === "number") {
        return nestedValue;
      }
    }

    return null;
  }

  private pickSavedPath(value: unknown): string | null {
    if (Array.isArray(value)) {
      for (const item of value) {
        const candidate = this.pickSavedPath(item);
        if (candidate) {
          return candidate;
        }
      }
      return null;
    }

    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of ["saved", "path", "file", "filepath", "filePath"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    for (const nestedKey of ["data", "result", "payload"]) {
      const nested = record[nestedKey];
      const candidate = this.pickSavedPath(nested);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  private async runBrowserCommand(
    profile: string,
    commandCandidates: string[][],
    timeoutMs: number,
    ignoreError = false,
    workingDir?: string
  ) {
    const errors: string[] = [];
    for (const commandArgs of commandCandidates) {
      try {
        return await this.runner.run(["--profile", profile, "browser", ...commandArgs], {
          timeoutMs,
          ignoreError,
          cwd: workingDir
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    throw new Error(errors.join("\n"));
  }
}
