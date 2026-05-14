import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { runPythonTool } from "./python-tool-runner";
import { v4 as uuidv4 } from "uuid";
import type { ContentBlock, DraftSummary, PostDraft, RewriteDraftIterativeOptions, RewriteDraftOptions } from "../types/app.types";
import { LlmService } from "./llm.service";
import { SettingsService } from "./settings.service";

type ImportedWordPayload = {
  title: string;
  paragraphs: string[];
  sectionImages: string[][];
};

export class ArticleRewriteService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly llmService: LlmService
  ) {}

  async listDrafts(): Promise<DraftSummary[]> {
    const draftsDir = await this.getDraftsDir();
    await mkdir(draftsDir, { recursive: true });
    const files = await readdir(draftsDir);

    const drafts = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const content = await readFile(join(draftsDir, file), "utf8");
          const draft = this.normalizeDraft(JSON.parse(content) as PostDraft);
          const coverImagePath = draft.contentBlocks.find((block) => block.type === "image")?.imagePath;
          return {
            draftId: draft.draftId,
            title: draft.title,
            createdAt: draft.createdAt,
            sectionCount: draft.sections.length,
            coverImagePath
          } satisfies DraftSummary;
        })
    );

    return drafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getDraftById(draftId: string): Promise<PostDraft> {
    const draftPath = join(await this.getDraftsDir(), `${draftId}.json`);
    return this.normalizeDraft(JSON.parse(await readFile(draftPath, "utf8")) as PostDraft);
  }

  async saveDraft(draft: PostDraft): Promise<PostDraft> {
    const draftsDir = await this.getDraftsDir();
    await mkdir(draftsDir, { recursive: true });
    const normalized = this.normalizeDraft(draft, true);
    await writeFile(join(draftsDir, `${normalized.draftId}.json`), JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  }

  async importWordDraft(sourceWordPath: string): Promise<PostDraft> {
    const draftId = uuidv4();
    const imagesDir = join(await this.getWorkspaceRootDir(), "images", draftId);
    await mkdir(imagesDir, { recursive: true });
    const parsed = await this.runWordImportScript(sourceWordPath, imagesDir);

    const sections = parsed.paragraphs.map((paragraph, index) => ({
      sectionId: `s${index + 1}`,
      paragraph: paragraph.trim(),
      sourceSegmentIds: [],
      sourceTimeRanges: [{ start: 0, end: 0, reason: "Word 导入" }]
    }));

    const contentBlocks: ContentBlock[] = [];
    for (const [index, section] of sections.entries()) {
      contentBlocks.push({
        type: "paragraph",
        blockId: `${section.sectionId}_p`,
        sectionId: section.sectionId,
        text: section.paragraph
      });
      for (const [imageOffset, imagePath] of (parsed.sectionImages[index] ?? []).entries()) {
        contentBlocks.push({
          type: "image",
          blockId: `${section.sectionId}_i_${imageOffset + 1}`,
          sectionId: section.sectionId,
          imagePath,
          time: 0,
          caption: "Word 原图",
          sourceType: "upload"
        });
      }
    }

    const draft: PostDraft = {
      draftId,
      title: parsed.title?.trim() || "图文改写草稿",
      fullText: sections.map((section) => section.paragraph).join("\n\n"),
      sections,
      contentBlocks,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return this.saveDraft(draft);
  }

  async replaceDraftImage(draftId: string, blockId: string, sourceImagePath: string): Promise<PostDraft> {
    const draft = await this.getDraftById(draftId);
    const targetBlock = draft.contentBlocks.find(
      (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image" && block.blockId === blockId
    );
    if (!targetBlock) {
      throw new Error("没有找到要替换的图片块。");
    }

    const imageDir = join(await this.getWorkspaceRootDir(), "images", draftId);
    await mkdir(imageDir, { recursive: true });
    const extension = extname(sourceImagePath) || ".jpg";
    const copiedImagePath = join(imageDir, `${blockId}_manual_${Date.now()}${extension}`);
    await copyFile(sourceImagePath, copiedImagePath);

    targetBlock.imagePath = copiedImagePath;
    targetBlock.sourceType = "upload";
    targetBlock.caption = "用户手动替换图片";
    return this.saveDraft(draft);
  }

  async rewriteParagraph(paragraph: string): Promise<string> {
    return this.llmService.rewriteParagraph(paragraph, "article-rewrite");
  }

  async rewriteDraft(options: RewriteDraftOptions): Promise<PostDraft> {
    const result = await this.llmService.rewriteArticleDraft(options);
    const draft = await this.getDraftById(options.draft.draftId);

    const normalizedSections = result.sections
      .map((section, index) => ({
        sectionId: section.sectionId?.trim() || `s${index + 1}`,
        paragraph: section.paragraph?.trim() || "",
        sourceSegmentIds: [],
        sourceTimeRanges: [{ start: 0, end: 0, reason: "图文改写重组" }]
      }))
      .filter((section) => section.paragraph.length > 0);

    const finalSections = normalizedSections.length > 0
      ? normalizedSections
      : [
          {
            sectionId: "s1",
            paragraph: draft.fullText || "暂无正文",
            sourceSegmentIds: [],
            sourceTimeRanges: [{ start: 0, end: 0, reason: "兜底保留" }]
          }
        ];

    const existingImages = draft.contentBlocks.filter(
      (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image"
    );

    const rebuiltBlocks: ContentBlock[] = [];
    finalSections.forEach((section, index) => {
      rebuiltBlocks.push({
        type: "paragraph",
        blockId: `${section.sectionId}_p_${index + 1}`,
        sectionId: section.sectionId,
        text: section.paragraph,
        edited: true
      });

      const bucketImages = existingImages.filter((_, imageIndex) => imageIndex % finalSections.length === index);
      for (const image of bucketImages) {
        rebuiltBlocks.push({
          ...image,
          sectionId: section.sectionId
        });
      }
    });

    draft.title = result.title?.trim() || draft.title;
    draft.sections = finalSections;
    draft.fullText = finalSections.map((section) => section.paragraph).join("\n\n");
    draft.contentBlocks = rebuiltBlocks;

    return this.saveDraft(draft);
  }

  async rewriteDraftIterative(options: RewriteDraftIterativeOptions): Promise<PostDraft> {
    const result = await this.llmService.rewriteArticleDraft(options);
    const draft = this.normalizeDraft(options.draft, true);

    const normalizedSections = result.sections
      .map((section, index) => ({
        sectionId: section.sectionId?.trim() || `s${index + 1}`,
        paragraph: section.paragraph?.trim() || "",
        sourceSegmentIds: [],
        sourceTimeRanges: [{ start: 0, end: 0, reason: "图文改写重组" }]
      }))
      .filter((section) => section.paragraph.length > 0);

    const finalSections = normalizedSections.length > 0
      ? normalizedSections
      : [
          {
            sectionId: "s1",
            paragraph: draft.fullText || "暂无正文",
            sourceSegmentIds: [],
            sourceTimeRanges: [{ start: 0, end: 0, reason: "兜底保留" }]
          }
        ];

    const existingImages = draft.contentBlocks.filter(
      (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image"
    );

    const rebuiltBlocks: ContentBlock[] = [];
    finalSections.forEach((section, index) => {
      rebuiltBlocks.push({
        type: "paragraph",
        blockId: `${section.sectionId}_p_${index + 1}`,
        sectionId: section.sectionId,
        text: section.paragraph,
        edited: true
      });

      const bucketImages = existingImages.filter((_, imageIndex) => imageIndex % finalSections.length === index);
      for (const image of bucketImages) {
        rebuiltBlocks.push({
          ...image,
          sectionId: section.sectionId
        });
      }
    });

    draft.title = result.title?.trim() || draft.title;
    draft.sections = finalSections;
    draft.fullText = finalSections.map((section) => section.paragraph).join("\n\n");
    draft.contentBlocks = rebuiltBlocks;

    return this.saveDraft(draft);
  }

  async exportDraftToWord(draft: PostDraft, outputPath: string): Promise<string> {
    const normalized = this.normalizeDraft(draft, true);
    const tempDir = join(await this.getWorkspaceRootDir(), "exports", "tmp", normalized.draftId);
    const tempDraftJsonPath = join(tempDir, `article-draft-${Date.now()}.json`);
    await mkdir(tempDir, { recursive: true });
    await writeFile(tempDraftJsonPath, JSON.stringify(normalized, null, 2), "utf8");

    try {
      await this.runWordExportScript(tempDraftJsonPath, outputPath);
      return outputPath;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async exportDraftImagesArchive(draft: PostDraft, outputPath: string): Promise<string> {
    const normalized = this.normalizeDraft(draft, true);
    const imageBlocks = normalized.contentBlocks.filter(
      (block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image"
    );
    if (imageBlocks.length === 0) {
      throw new Error("当前草稿没有可导出的配图。");
    }

    const tempDir = join(await this.getWorkspaceRootDir(), "exports", "tmp", `${normalized.draftId}-images`);
    const stagingDir = join(tempDir, "images");
    await mkdir(stagingDir, { recursive: true });

    try {
      for (const [index, block] of imageBlocks.entries()) {
        const extension = extname(block.imagePath) || ".jpg";
        const fileName = `${String(index + 1).padStart(2, "0")}_${this.sanitizeFileName(block.sectionId)}${extension}`;
        await copyFile(block.imagePath, join(stagingDir, fileName));
      }

      await this.runZipArchiveScript(stagingDir, outputPath);
      return outputPath;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async getWorkspaceRootDir(): Promise<string> {
    return join((await this.settingsService.getSettings()).workspaceDir, "article-rewrite");
  }

  private async getDraftsDir(): Promise<string> {
    return join(await this.getWorkspaceRootDir(), "drafts");
  }

  private normalizeDraft(draft: PostDraft, touchUpdatedAt = false): PostDraft {
    const sections = draft.sections.map((section) => ({
      ...section,
      paragraph: section.paragraph ?? "",
      sourceSegmentIds: section.sourceSegmentIds ?? [],
      sourceTimeRanges: section.sourceTimeRanges ?? []
    }));

    const contentBlocks = draft.contentBlocks.map((block) =>
      block.type === "paragraph"
        ? { ...block, text: sections.find((section) => section.sectionId === block.sectionId)?.paragraph ?? block.text ?? "" }
        : { ...block, sourceType: block.sourceType ?? "upload" }
    ) as ContentBlock[];

    return {
      ...draft,
      sections,
      contentBlocks,
      fullText: sections.map((section) => section.paragraph).join("\n\n"),
      updatedAt: touchUpdatedAt ? new Date().toISOString() : draft.updatedAt ?? draft.createdAt
    };
  }

  private async runWordImportScript(sourceWordPath: string, outputImageDir: string): Promise<ImportedWordPayload> {
    const { stdout } = await runPythonTool(
      "import_word_docx",
      "import_word_docx.py",
      [sourceWordPath, outputImageDir],
      {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      }
    );

    try {
      return JSON.parse(stdout) as ImportedWordPayload;
    } catch (error) {
      throw new Error(`Word import returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async runWordExportScript(draftJsonPath: string, outputPath: string): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });

    await runPythonTool(
      "export_draft_docx",
      "export_draft_docx.py",
      [draftJsonPath, outputPath],
      {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      }
    );
  }

  private async runZipArchiveScript(sourceDir: string, outputPath: string): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "& { param([string]$SourceDir,[string]$OutputPath) if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force } Compress-Archive -Path (Join-Path $SourceDir '*') -DestinationPath $OutputPath -Force }",
          sourceDir,
          outputPath
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => rejectPromise(error));
      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        rejectPromise(new Error(`Images archive export failed with code ${code}: ${stderr}`));
      });
    });
  }

  private sanitizeFileName(value: string): string {
    return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "image";
  }
}


