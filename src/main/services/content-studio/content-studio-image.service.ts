import { extname, isAbsolute, join } from "node:path";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import type { OpenCliProvider } from "../../types/app.types";
import type { ContentStudioGenerateImageOptions } from "../../types/content-studio.types";
import { ContentStudioSettingsService } from "./content-studio-settings.service";
import { OpenCliCommandRunner } from "../opencli/opencli-command-runner";
import { SettingsService } from "../settings.service";

export type ContentStudioGeneratedImage = {
  localPath: string;
  prompt: string;
  paragraphId?: string;
  sourceRef?: string;
};

const IMAGE_SUPPORTED_PROVIDERS = new Set<OpenCliProvider>(["chatgpt", "gemini", "claude", "grok", "yuanbao", "doubao"]);
const BROWSER_IMAGE_PROVIDERS = new Set<OpenCliProvider>(["chatgpt", "yuanbao", "doubao"]);
const BROWSER_PROVIDER_URL: Partial<Record<OpenCliProvider, string>> = {
  chatgpt: "https://chatgpt.com/new",
  yuanbao: "https://yuanbao.tencent.com/chat",
  doubao: "https://www.doubao.com/chat/"
};
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
export class ContentStudioImageService {
  constructor(
    private readonly studioSettingsService: ContentStudioSettingsService,
    private readonly openCliRunner: OpenCliCommandRunner,
    private readonly appSettingsService: SettingsService
  ) {}

  async generateImage(taskId: string, taskImagesDir: string, options: ContentStudioGenerateImageOptions): Promise<ContentStudioGeneratedImage> {
    const prompt = String(options.prompt || "").trim();
    if (!prompt) {
      throw new Error("缺少生图提示词 prompt");
    }

    const settings = await this.studioSettingsService.getSettings();
    if (!settings.image.enabled) {
      throw new Error("请先在内容创作工作台全局配置中开启图片能力");
    }

    const provider = settings.image.provider as OpenCliProvider;
    if (!IMAGE_SUPPORTED_PROVIDERS.has(provider)) {
      throw new Error(`当前 provider 不支持生图：${provider}。请切换为 chatgpt/gemini/claude/grok/yuanbao/doubao`);
    }

    const profile = String(settings.image.profile || "").trim();
    if (!profile) {
      throw new Error("请先配置图片模型 Profile");
    }

    if (BROWSER_IMAGE_PROVIDERS.has(provider)) {
      const browserDownloadDir = await this.resolveBrowserDownloadDir(settings.image.outputDir);
      return this.generateByBrowserImageFlow(
        provider,
        profile,
        taskId,
        taskImagesDir,
        browserDownloadDir,
        prompt,
        settings.tabs.layout.timeoutMs,
        options.paragraphId
      );
    }

    const before = await this.listImageFiles(taskImagesDir);
    await this.openCliRunner.run(
      [
        "--profile",
        profile,
        provider,
        "image",
        prompt,
        "--op",
        taskImagesDir,
        "--timeout",
        String(Math.max(30, Math.floor(settings.tabs.layout.timeoutMs / 1000)))
      ],
      {
        timeoutMs: settings.tabs.layout.timeoutMs,
        cwd: taskImagesDir
      }
    );
    const after = await this.listImageFiles(taskImagesDir);

    let created = "";
    for (const item of after) {
      if (!before.has(item)) {
        created = item;
        break;
      }
    }
    if (!created) {
      throw new Error("AI 生图命令已执行，但未检测到新图片文件。请检查 OpenCLI image 命令输出或重试。");
    }

    return {
      localPath: join(taskImagesDir, created),
      prompt,
      paragraphId: options.paragraphId
    };
  }

  private async generateByBrowserImageFlow(
    provider: OpenCliProvider,
    profile: string,
    taskId: string,
    taskImagesDir: string,
    browserDownloadDir: string,
    prompt: string,
    timeoutMs: number,
    paragraphId?: string
  ): Promise<ContentStudioGeneratedImage> {
    await mkdir(browserDownloadDir, { recursive: true });
    const targetUrl = BROWSER_PROVIDER_URL[provider] || BROWSER_PROVIDER_URL.chatgpt || "https://chatgpt.com/new";
    await this.openCliRunner.run(["--profile", profile, "browser", provider, "open", targetUrl], { timeoutMs });
    if (provider === "yuanbao") {
      const directFill = await this.openCliRunner.run(
        ["--profile", profile, "browser", provider, "fill", `生成图片：${prompt}`],
        { timeoutMs, ignoreError: true }
      );
      if (directFill.code !== 0) {
        await this.openCliRunner.run(
          ["--profile", profile, "browser", provider, "fill", ".ql-editor", `生成图片：${prompt}`],
          { timeoutMs }
        );
      }
    } else {
      const inputSelector = provider === "doubao" ? "textarea[placeholder='发消息...']" : "textarea";
      await this.openCliRunner.run(
        ["--profile", profile, "browser", provider, "fill", inputSelector, `生成图片：${prompt}`],
        { timeoutMs }
      );
    }
    await this.submitPromptRobustly(provider, profile, timeoutMs);

    const startedAt = Date.now();
    let imageSrc = "";
    let downloadedName = "";
    let pollRound = 0;
    const extensionFallback = ".png";
    const safeTaskId = String(taskId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const dynamicDownloadName = `${provider}-image-${safeTaskId}-${Date.now()}${extensionFallback}`;
    const before = await this.listImageFiles(browserDownloadDir);
    while (Date.now() - startedAt < timeoutMs) {
      pollRound += 1;
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const oneShotScript =
        provider === "doubao"
          ? `(function(){var imgs=Array.from(document.images).filter(function(img){if(!img||!img.src){return false;} var src=String(img.src); if(!/^https?:/i.test(src)){return false;} if((img.naturalWidth||0)<200||(img.naturalHeight||0)<200){return false;} var isTargetAttr=String(img.alt||'').toLowerCase()==='image'&&String(img.loading||'').toLowerCase()==='lazy'; var isDoubaoSrc=src.indexOf('-flow-imagex-sign.byteimg.com')>=0||src.indexOf('byteimg.com')>=0||src.indexOf('/rc_gen_image/')>=0||/\\.(png|jpg|jpeg|webp)(\\?|$)/i.test(src); return isTargetAttr&&isDoubaoSrc;}); if(!imgs.length){throw new Error('image not found');} var src=imgs[imgs.length-1].src; return {ok:true, src:src, name:'${dynamicDownloadName}'};})()`
          : `(async function(){var imgs=Array.from(document.images).filter(function(img){if(!img||!img.src){return false;} var src=String(img.src); if(!/^https?:/i.test(src)){return false;} if((img.naturalWidth||0)<256||(img.naturalHeight||0)<256){return false;} var isChatGpt=src.indexOf('id=file_')>=0||src.indexOf('/backend-api/')>=0; var hasImageExt=/\\.(png|jpg|jpeg|webp)(\\?|$)/i.test(src); var isYuanbaoCos=/hunyuan-prod-\\d+\\.cos\\.ap-guangzhou\\.myqcloud\\.com/i.test(src)||/\\.cos\\.[^/]+\\.myqcloud\\.com/i.test(src); return isChatGpt||hasImageExt||isYuanbaoCos;}); if(!imgs.length){throw new Error('image not found');} var src=imgs[imgs.length-1].src; var r=await fetch(src,{credentials:'include'}); if(!r.ok){throw new Error('download failed: '+r.status);} var b=await r.blob(); var u=URL.createObjectURL(b); var a=document.createElement('a'); a.href=u; a.download='${dynamicDownloadName}'; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(u); a.remove();},3000); return {ok:true, src:src, size:b.size, type:b.type, name:'${dynamicDownloadName}'};})()`;
      const evalArgs = ["--profile", profile, "browser", provider, "eval", oneShotScript];
      const evalResult = await this.openCliRunner.run(
        evalArgs,
        { timeoutMs: 30000, ignoreError: true }
      );
      const payload = this.parseJsonObject(evalResult.stdout || evalResult.stderr);
      const ok = Boolean((payload as { ok?: boolean }).ok);
      const src = String((payload as { src?: string }).src || "").trim();
      const name = String((payload as { name?: string }).name || "").trim();
      if (ok && src) {
        imageSrc = src;
        downloadedName = name || dynamicDownloadName;
        break;
      }
    }

    if (!imageSrc) {
      throw new Error(`${provider} 图片生成超时，未检测到可下载图片。建议先手动在页面确认图片已出现。`);
    }

    await mkdir(taskImagesDir, { recursive: true });
    if (provider === "doubao") {
      const directPath = await this.downloadImageFromUrl(imageSrc, taskImagesDir);
      return {
        localPath: directPath,
        prompt,
        paragraphId,
        sourceRef: this.extractFileRef(imageSrc) || undefined
      };
    }

    const created = await this.waitForDownloadedFile(browserDownloadDir, before, timeoutMs);
    if (!created) {
      throw new Error(`${provider} 已返回图片，但在浏览器下载目录中未检测到新文件。请检查浏览器默认下载路径配置。`);
    }

    const extension = this.inferImageExtFromSrc(imageSrc);
    const taskFileName = `generated-${Date.now()}${extension}`;
    const targetPath = join(taskImagesDir, taskFileName);
    await copyFile(join(browserDownloadDir, created), targetPath);

    return {
      localPath: targetPath,
      prompt,
      paragraphId,
      sourceRef: this.extractFileRef(imageSrc) || undefined
    };
  }

  private async waitForDownloadedFile(
    browserDownloadDir: string,
    before: Set<string>,
    timeoutMs: number
  ): Promise<string> {
    const startedAt = Date.now();
    let round = 0;
    while (Date.now() - startedAt < timeoutMs) {
      round += 1;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const after = await this.listImageFiles(browserDownloadDir);
      for (const item of after) {
        if (before.has(item)) {
          continue;
        }
        try {
          const info = await stat(join(browserDownloadDir, item));
          if (info.size > 0) {
            return item;
          }
        } catch {
          continue;
        }
      }
    }
    return "";
  }

  private async resolveBrowserDownloadDir(configuredOutputDir?: string): Promise<string> {
    const outputDir = String(configuredOutputDir || "").trim();
    if (!outputDir) {
      throw new Error("请先在内容创作工作台全局配置里填写“浏览器默认下载目录”。");
    }
    if (isAbsolute(outputDir)) {
      return outputDir;
    }
    const workspaceDir = (await this.appSettingsService.getSettings()).workspaceDir;
    return join(workspaceDir, outputDir);
  }

  private inferImageExtFromSrc(src: string): string {
    const match = src.match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i);
    if (!match) {
      return ".png";
    }
    const ext = `.${String(match[1]).toLowerCase()}`;
    return ext === ".jpeg" ? ".jpg" : ext;
  }

  private async downloadImageFromUrl(src: string, taskImagesDir: string): Promise<string> {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`下载图片失败：${response.status}`);
    }
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const byType = contentType.includes("png")
      ? ".png"
      : contentType.includes("webp")
        ? ".webp"
        : contentType.includes("jpeg") || contentType.includes("jpg")
          ? ".jpg"
          : "";
    const extension = byType || this.inferImageExtFromSrc(src);
    const fileName = `generated-${Date.now()}${extension}`;
    const targetPath = join(taskImagesDir, fileName);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(targetPath, bytes);
    return targetPath;
  }

  private async listImageFiles(dir: string): Promise<Set<string>> {
    const entries = await readdir(dir, { withFileTypes: true });
    return new Set(
      entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => IMAGE_EXTENSIONS.has(extname(name).toLowerCase()))
    );
  }

  private parseJsonObject(text: string): Record<string, unknown> {
    const raw = String(text || "").trim();
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return {};
      }
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }

  private hasVisibleSendButton(payload: Record<string, unknown>): boolean {
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    for (const item of entries) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const record = item as Record<string, unknown>;
      const tag = String(record.tag || "").toLowerCase();
      const visible = Boolean(record.visible);
      if (tag === "button" && visible) {
        return true;
      }
    }
    return false;
  }

  private logSubmit(message: string, payload?: Record<string, unknown>): void {
    const body = payload ? ` ${JSON.stringify(payload)}` : "";
    // eslint-disable-next-line no-console
    console.log(`[ContentStudioImageService.submit] ${message}${body}`);
  }

  private extractFileRef(src: string): string {
    const match = String(src || "").match(/id=(file_[a-zA-Z0-9]+)/);
    return match?.[1] || "";
  }

  private async submitPromptRobustly(provider: OpenCliProvider, profile: string, timeoutMs: number): Promise<void> {
    this.logSubmit("submit start", { provider, profile, timeoutMs, mode: "sleep4s-click-enter" });
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const sendSelector =
      provider === "yuanbao"
        ? "a#yuanbao-send-btn"
        : provider === "doubao"
          ? "button#flow-end-msg-send"
          : "button[data-testid='send-button']";
    const clickResult = await this.openCliRunner.run(
      ["--profile", profile, "browser", provider, "click", sendSelector],
      { timeoutMs: Math.min(timeoutMs, 20000), ignoreError: true }
    );
    const clickPayload = this.parseJsonObject(clickResult.stdout || clickResult.stderr);
    this.logSubmit("click send-button", {
      code: clickResult.code,
      clicked: Boolean((clickPayload as { clicked?: boolean }).clicked),
      target: String((clickPayload as { target?: string }).target || "")
    });

    const enterResult = await this.openCliRunner.run(["--profile", profile, "browser", provider, "keys", "Enter"], {
      timeoutMs: Math.min(timeoutMs, 20000),
      ignoreError: true
    });
    this.logSubmit("enter after click", { code: enterResult.code, enterSent: enterResult.code === 0 });

    // Give chatgpt a short settle window before image polling phase.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
