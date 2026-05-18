import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import type { ContentStudioImageAsset } from "../../types/content-studio.types";
import { SettingsService } from "../settings.service";
import { OpenCliBrowserService } from "../opencli/opencli-browser.service";
import { OpenCliImageDownloader } from "../opencli/opencli-image-downloader";
import { OpenCliRuntimeService } from "../opencli/opencli-runtime.service";
import { ContentStudioSettingsService } from "./content-studio-settings.service";

export class ContentStudioResourceService {
  constructor(
    private readonly openCliBrowserService: OpenCliBrowserService,
    private readonly openCliImageDownloader: OpenCliImageDownloader,
    private readonly openCliRuntimeService: OpenCliRuntimeService,
    private readonly settingsService: SettingsService,
    private readonly contentStudioSettingsService: ContentStudioSettingsService
  ) {}

  async collectFromUrl(
    url: string,
    options?: { collectImages?: boolean; sourceId?: string }
  ): Promise<{ title: string; body: string; images: ContentStudioImageAsset[] }> {
    const targetUrl = String(url || "").trim();
    if (!targetUrl) {
      throw new Error("URL 不能为空");
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      throw new Error("URL 格式不正确，需以 http:// 或 https:// 开头");
    }

    const settings = await this.contentStudioSettingsService.getSettings();
    const profile = settings.tabs.material.modelA.profile.trim() || settings.tabs.material.modelB.profile.trim();
    if (!profile) {
      throw new Error("素材二创模型未配置 Profile，无法进行 URL 采集");
    }

    const workspaceDir = (await this.settingsService.getSettings()).workspaceDir;
    const sessionName = `material_${randomUUID().replace(/-/g, "")}`;
    let title = targetUrl;
    try {
      await this.openCliRuntimeService.ensureHealthy();
      await this.openCliBrowserService.open(profile, sessionName, targetUrl, workspaceDir);
      await this.openCliBrowserService.wait(profile, sessionName, 3, workspaceDir);
      title = await this.openCliBrowserService.getTitle(profile, sessionName, workspaceDir).catch(() => targetUrl);
      const body = await this.openCliBrowserService.extract(profile, sessionName, targetUrl, 8000, workspaceDir);
      const images = options?.collectImages
        ? await this.collectImages(profile, sessionName, workspaceDir, options?.sourceId)
        : [];
      return { title: String(title || targetUrl).trim(), body: body.trim(), images };
    } finally {
      await this.openCliBrowserService.close(profile, sessionName, workspaceDir).catch(() => undefined);
    }
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
