import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

export type ImageDownloadResult = {
  sourceUrl: string;
  localPath?: string;
  failedReason?: string;
};

export class OpenCliImageDownloader {
  async downloadImages(urls: string[], outputDir: string): Promise<ImageDownloadResult[]> {
    await mkdir(outputDir, { recursive: true });
    const uniqueUrls = Array.from(new Set(urls.map((item) => item.trim()).filter(Boolean)));
    const results: ImageDownloadResult[] = [];

    for (const url of uniqueUrls) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0"
          }
        });

        if (!response.ok) {
          results.push({
            sourceUrl: url,
            failedReason: `HTTP ${response.status}`
          });
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const extension = this.inferExtension(url, response.headers.get("content-type"));
        const localPath = join(outputDir, `${randomUUID()}${extension}`);

        await writeFile(localPath, buffer);
        results.push({
          sourceUrl: url,
          localPath
        });
      } catch (error) {
        results.push({
          sourceUrl: url,
          failedReason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  private inferExtension(url: string, contentType?: string | null): string {
    try {
      const fromUrl = extname(new URL(url).pathname);
      if (fromUrl && fromUrl.length <= 8) {
        return fromUrl;
      }
    } catch {
      // Ignore invalid URL format and continue with content-type inference.
    }

    const loweredContentType = String(contentType || "").toLowerCase();
    if (loweredContentType.includes("png")) return ".png";
    if (loweredContentType.includes("webp")) return ".webp";
    if (loweredContentType.includes("gif")) return ".gif";

    return ".jpg";
  }
}

