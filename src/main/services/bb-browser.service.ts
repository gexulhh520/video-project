import axios from "axios";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { SettingsService } from "./settings.service";

type BbBrowserResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type OpenResponse = {
  url: string;
  tabId: string;
  tab?: string;
  seq?: number;
};

type TitleResponse = {
  value: string;
  tab?: string;
};

export class BbBrowserService {
  constructor(private readonly settingsService: SettingsService) {}

  async open(url: string): Promise<OpenResponse> {
    return this.runJsonCommand<OpenResponse>(["open", url, "--json"]);
  }

  async getTitle(tabId: string): Promise<string> {
    const result = await this.runJsonCommand<TitleResponse>(["--tab", tabId, "get", "title", "--json"]);
    return result.value?.trim() ?? "";
  }

  async snapshot(tabId: string): Promise<string> {
    const output = await this.runRawCommand(["--tab", tabId, "snapshot"], 45000);
    return output.trim();
  }

  async collectImageUrls(tabId: string): Promise<string[]> {
    const script = this.buildCollectImageEvalScript();
    const response = await this.sendDaemonCommand({
      id: uuidv4(),
      action: "eval",
      script,
      tabId
    });

    if (!response.success) {
      throw new Error(response.error || "bb-browser daemon eval failed");
    }

    return JSON.parse(response.data?.result || "[]") as string[];
  }

  async close(tabId: string): Promise<void> {
    await this.runRawCommand(["--tab", tabId, "close"], 15000, true);
  }

  async downloadImages(
    urls: string[],
    outputDir: string,
    referer?: string
  ): Promise<Array<{ sourceUrl: string; localPath?: string; failedReason?: string }>> {
    await mkdir(outputDir, { recursive: true });
    const uniqueUrls = [...new Set(urls)].filter((url) => /^https?:\/\//i.test(url));
    const results: Array<{ sourceUrl: string; localPath?: string; failedReason?: string }> = [];

    for (const sourceUrl of uniqueUrls) {
      try {
        const response = await this.fetchImageWithRetry(sourceUrl, referer);
        const pathname = new URL(sourceUrl).pathname;
        const ext = extname(pathname) || ".jpg";
        const filename = `${Date.now()}_${uuidv4()}_${basename(pathname || "image").replace(/[^\w.-]+/g, "_") || "image"}${
          extname(pathname) ? "" : ext
        }`;
        const localPath = join(outputDir, filename);
        await writeFile(localPath, Buffer.from(response.data));
        results.push({ sourceUrl, localPath });
      } catch (error) {
        results.push({
          sourceUrl,
          failedReason: error instanceof Error ? error.message : "下载图片失败"
        });
      }
    }

    return results;
  }

  private buildCollectImageEvalScript(): string {
    return `
(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const resolveUrl = (value) => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return null;
    try {
      return new URL(trimmed, location.href).href;
    } catch (_error) {
      return null;
    }
  };
  const parseSrcset = (value) => {
    if (!value || typeof value !== "string") return [];
    return value
      .split(",")
      .map((item) => item.trim().split(/\\s+/)[0])
      .map((item) => resolveUrl(item))
      .filter(Boolean);
  };
  const parseBackgroundImage = (value) => {
    if (!value || typeof value !== "string") return [];
    const matches = [...value.matchAll(/url\\((['"]?)(.*?)\\1\\)/g)];
    return matches.map((item) => resolveUrl(item[2])).filter(Boolean);
  };
  const pullFromDocument = (doc) => {
    const urls = new Set();
    const add = (value) => {
      const normalized = resolveUrl(value);
      if (normalized) urls.add(normalized);
    };

    const imageLikeAttrs = [
      "src",
      "currentSrc",
      "data-src",
      "data-original",
      "data-lazy-src",
      "data-lazyload",
      "data-url",
      "data-echo"
    ];

    doc.querySelectorAll("img").forEach((img) => {
      imageLikeAttrs.forEach((attr) => add(attr === "currentSrc" ? img.currentSrc : img.getAttribute(attr)));
      parseSrcset(img.getAttribute("srcset")).forEach(add);
      parseSrcset(img.getAttribute("data-srcset")).forEach(add);
    });

    doc.querySelectorAll("picture source").forEach((source) => {
      parseSrcset(source.getAttribute("srcset")).forEach(add);
      parseSrcset(source.getAttribute("data-srcset")).forEach(add);
      add(source.getAttribute("src"));
    });

    doc.querySelectorAll("[style]").forEach((node) => {
      parseBackgroundImage(node.getAttribute("style")).forEach(add);
    });

    doc.querySelectorAll("*").forEach((node) => {
      const cssText = getComputedStyle(node).backgroundImage;
      parseBackgroundImage(cssText).forEach(add);
    });

    return urls;
  };

  return (async () => {
    for (let i = 0; i < 4; i += 1) {
      window.scrollTo(0, Math.floor((document.documentElement.scrollHeight - 1) * ((i + 1) / 4)));
      await sleep(350);
    }
    window.scrollTo(0, 0);
    await sleep(300);

    const allUrls = pullFromDocument(document);
    document.querySelectorAll("iframe").forEach((frame) => {
      try {
        const childDoc = frame.contentDocument;
        if (!childDoc) return;
        pullFromDocument(childDoc).forEach((value) => allUrls.add(value));
      } catch (_error) {
        // Cross-origin iframe can't be read.
      }
    });

    return JSON.stringify([...allUrls], null, 2);
  })();
})()
`.trim();
  }

  private async fetchImageWithRetry(sourceUrl: string, referer?: string): Promise<{ data: ArrayBuffer }> {
    const baseHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    };

    if (referer?.trim()) {
      baseHeaders.Referer = referer.trim();
    }

    const attempt = async (timeout: number): Promise<{ data: ArrayBuffer }> =>
      axios.get<ArrayBuffer>(sourceUrl, {
        responseType: "arraybuffer",
        timeout,
        headers: baseHeaders
      });

    try {
      return await attempt(30000);
    } catch (_error) {
      return await attempt(45000);
    }
  }

  private async runJsonCommand<T>(args: string[]): Promise<T> {
    const raw = await this.runRawCommand(args, 45000);
    const parsed = JSON.parse(raw) as BbBrowserResponse<T>;
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.error || `bb-browser command failed: ${args.join(" ")}`);
    }

    return parsed.data;
  }

  private async runRawCommand(args: string[], timeoutMs: number, ignoreError = false): Promise<string> {
    const { command, prefixArgs } = await this.resolveCliCommand();

    return new Promise<string>((resolvePromise, rejectPromise) => {
      const normalized = this.buildSpawnCommand(command, [...prefixArgs, ...args]);
      const child = spawn(normalized.command, normalized.args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        if (ignoreError) {
          resolvePromise(stdout.trim());
          return;
        }

        rejectPromise(new Error(`bb-browser timed out: ${args.join(" ")}`));
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
          resolvePromise(stdout.trim());
          return;
        }
        rejectPromise(error);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !ignoreError) {
          rejectPromise(new Error(stderr.trim() || stdout.trim() || `bb-browser exited with code ${code}`));
          return;
        }

        resolvePromise(stdout.trim());
      });
    });
  }

  private async resolveCliCommand(): Promise<{ command: string; prefixArgs: string[] }> {
    const settings = await this.settingsService.getWebToPostSettings();
    const command = this.normalizeExecutable(settings.bbBrowserCommand.trim());
    const prefixArgs = this.parseArgs(settings.bbBrowserArgs);

    if (command.toLowerCase() === "bb-browser" && prefixArgs.includes("-p") && prefixArgs.includes("bb-browser")) {
      return {
        command: this.normalizeExecutable("npx"),
        prefixArgs
      };
    }

    return {
      command,
      prefixArgs
    };
  }

  private parseArgs(value: string): string[] {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeExecutable(command: string): string {
    if (process.platform === "win32") {
      if (command.toLowerCase() === "npx") {
        return "npx.cmd";
      }

      if (command.toLowerCase() === "npm") {
        return "npm.cmd";
      }
    }

    return command;
  }

  private buildSpawnCommand(command: string, args: string[]): { command: string; args: string[] } {
    if (process.platform === "win32" && this.requiresCmdWrapper(command)) {
      const commandLine = [command, ...args].map((item) => this.quoteForCmd(item)).join(" ");
      return {
        command: "cmd.exe",
        args: ["/d", "/s", "/c", commandLine]
      };
    }

    return {
      command,
      args
    };
  }

  private requiresCmdWrapper(command: string): boolean {
    const lower = command.toLowerCase();
    return lower.endsWith(".cmd") || lower === "npx" || lower === "npm";
  }

  private quoteForCmd(value: string): string {
    if (!/[\s"&^|<>]/.test(value)) {
      return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
  }

  private async sendDaemonCommand(requestBody: {
    id: string;
    action: string;
    script?: string;
    tabId?: string;
  }): Promise<{
    success: boolean;
    data?: {
      result?: string;
    };
    error?: string;
  }> {
    const daemonInfo = await this.readDaemonInfo();
    if (!daemonInfo) {
      throw new Error("No daemon.json found. Is the daemon running?");
    }

    return new Promise((resolvePromise, rejectPromise) => {
      const payload = JSON.stringify(requestBody);
      const req = httpRequest(
        {
          hostname: daemonInfo.host,
          port: daemonInfo.port,
          path: "/command",
          method: "POST",
          headers: {
            Authorization: `Bearer ${daemonInfo.token}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          },
          timeout: 30000
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if ((res.statusCode ?? 500) >= 400) {
              rejectPromise(new Error(`Daemon HTTP ${res.statusCode}: ${raw}`));
              return;
            }

            try {
              resolvePromise(JSON.parse(raw) as { success: boolean; data?: { result?: string }; error?: string });
            } catch {
              rejectPromise(new Error(`Invalid JSON from daemon: ${raw}`));
            }
          });
        }
      );

      req.on("error", rejectPromise);
      req.on("timeout", () => {
        req.destroy();
        rejectPromise(new Error("Daemon request timed out"));
      });

      req.write(payload);
      req.end();
    });
  }

  private async readDaemonInfo(): Promise<{ host: string; port: number; token: string } | null> {
    const daemonPath = join(process.env.BB_BROWSER_HOME || join(homedir(), ".bb-browser"), "daemon.json");

    try {
      const raw = await readFile(daemonPath, "utf8");
      const parsed = JSON.parse(raw) as { host?: string; port?: number; token?: string };
      if (typeof parsed.host === "string" && typeof parsed.port === "number" && typeof parsed.token === "string") {
        return {
          host: parsed.host,
          port: parsed.port,
          token: parsed.token
        };
      }

      return null;
    } catch {
      return null;
    }
  }

}
