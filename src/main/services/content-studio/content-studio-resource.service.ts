import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import type { ContentStudioImageAsset } from "../../types/content-studio.types";
import { SettingsService } from "../settings.service";
import { OpenCliBrowserService } from "../opencli/opencli-browser.service";
import { OpenCliImageDownloader } from "../opencli/opencli-image-downloader";
import { OpenCliRuntimeService } from "../opencli/opencli-runtime.service";
import { OpenCliWebLlmService } from "../opencli/opencli-web-llm.service";
import { ContentStudioSettingsService } from "./content-studio-settings.service";

export class ContentStudioResourceService {
  constructor(
    private readonly openCliBrowserService: OpenCliBrowserService,
    private readonly openCliImageDownloader: OpenCliImageDownloader,
    private readonly openCliRuntimeService: OpenCliRuntimeService,
    private readonly openCliWebLlmService: OpenCliWebLlmService,
    private readonly settingsService: SettingsService,
    private readonly contentStudioSettingsService: ContentStudioSettingsService
  ) {}

  async collectFromUrl(
    url: string,
    options?: { collectImages?: boolean; sourceId?: string; extractMode?: "llm" | "browser" }
  ): Promise<{
    title: string;
    body: string;
    images: ContentStudioImageAsset[];
    extractMethod: "browser_extract" | "llmweb_body_extract" | "llmweb_url_extract";
  }> {
    const targetUrl = String(url || "").trim();
    if (!targetUrl) {
      throw new Error("URL 不能为空");
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      throw new Error("URL 格式不正确，需要以 http:// 或 https:// 开头");
    }

    const settings = await this.contentStudioSettingsService.getSettings();
    const profile = settings.tabs.material.modelA.profile.trim() || settings.tabs.material.modelB.profile.trim();
    const provider = settings.tabs.material.modelA.provider;
    if (!profile) {
      throw new Error("素材二创模型未配置 Profile，无法进行 URL 采集");
    }

    const workspaceDir = (await this.settingsService.getSettings()).workspaceDir;
    const sessionName = `material_${randomUUID().replace(/-/g, "")}`;
    let title = targetUrl;
    let browserOpenSucceeded = false;
    let browserBody = "";
    let images: ContentStudioImageAsset[] = [];
    const extractMode = options?.extractMode ?? "llm";

    try {
      await this.openCliRuntimeService.ensureHealthy();

      // 第一步：浏览器打开获取标题（两种模式都需要）
      try {
        await this.openCliBrowserService.open(profile, sessionName, targetUrl, workspaceDir);
        browserOpenSucceeded = true;
        await this.openCliBrowserService.wait(profile, sessionName, 3, workspaceDir);
        title = await this.openCliBrowserService.getTitle(profile, sessionName, workspaceDir).catch(() => targetUrl);
        // 如果选择爬取模式，同时提取正文和采集图片
        if (extractMode === "browser") {
          browserBody = await this.openCliBrowserService.extract(profile, sessionName, targetUrl, 8000, workspaceDir);
          images = options?.collectImages
            ? await this.collectImages(profile, sessionName, workspaceDir, options?.sourceId)
            : [];
        }
      } catch {
        browserOpenSucceeded = false;
      }

      // 爬取模式：优先使用浏览器提取的正文
      if (extractMode === "browser") {
        if (this.isGoodBody(browserBody)) {
          return {
            title: String(title || targetUrl).trim(),
            body: browserBody.trim(),
            images,
            extractMethod: "browser_extract"
          };
        }

        // 浏览器提取失败，尝试用 LLM 清洗 HTML
        if (browserOpenSucceeded && browserBody.trim()) {
          try {
            const cleaned = await this.openCliWebLlmService.extractArticleFromBody({
              provider,
              profile,
              title: String(title || targetUrl).trim(),
              body: browserBody.trim(),
              timeoutMs: settings.tabs.material.timeoutMs,
              intervalMs: settings.tabs.material.pollIntervalMs,
              workingDir: workspaceDir
            });
            if (this.isGoodBody(cleaned)) {
              return {
                title: String(title || targetUrl).trim(),
                body: cleaned.trim(),
                images,
                extractMethod: "llmweb_body_extract"
              };
            }
          } catch {
            // Continue to URL-level fallback.
          }
        }
      }

      // LLM 模式（默认）：直接用 LLM 访问链接提取正文，带上标题
      const urlExtract = await this.openCliWebLlmService.extractArticleFromUrl({
        provider,
        profile,
        url: targetUrl,
        title: String(title || targetUrl).trim(), // 带上已获取的标题
        timeoutMs: settings.tabs.material.timeoutMs,
        intervalMs: settings.tabs.material.pollIntervalMs,
        workingDir: workspaceDir
      });

      if (this.isGoodBody(urlExtract.body)) {
        return {
          title: String(urlExtract.title || title || targetUrl).trim(),
          body: String(urlExtract.body || "").trim(),
          images,
          extractMethod: "llmweb_url_extract"
        };
      }

      throw new Error(urlExtract.reason || "网页正文提取失败，可手动粘贴正文");
    } finally {
      await this.openCliBrowserService.close(profile, sessionName, workspaceDir).catch(() => undefined);
    }
  }

  private isGoodBody(body: string): boolean {
    const normalized = String(body || "").trim();
    if (normalized.length < 120) {
      return false;
    }
    return normalized.replace(/\s+/g, "").length >= 80;
  }

  private async collectImages(
    profile: string,
    sessionName: string,
    workspaceDir: string,
    sourceId?: string
  ): Promise<ContentStudioImageAsset[]> {
    const candidates = await this.openCliBrowserService.collectImageUrls(profile, sessionName, workspaceDir);
    const urls = Array.from(new Set(candidates.map((item) => String(item.src || "").trim()).filter(Boolean))).slice(0, 20);
    if (!urls.length) {
      return [];
    }
    const outputDir = join(workspaceDir, "content-studio", "downloads", sourceId || "material");
    const downloaded = await this.openCliImageDownloader.downloadImages(urls, outputDir);
    return downloaded
      .filter((item) => Boolean(item.localPath))
      .map((item) => ({
        assetId: randomUUID(),
        sourceType: "source",
        fileName: basename(item.localPath || ""),
        localPath: item.localPath as string,
        createdAt: new Date().toISOString(),
        sourceRef: item.sourceUrl
      }));
  }
}
