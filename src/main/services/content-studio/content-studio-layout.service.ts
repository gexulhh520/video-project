import { copyFile, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ContentStudioGenerateImageOptions,
  ContentStudioImageAsset,
  ContentStudioParagraphImagePlanUpdate,
  ContentStudioTask
} from "../../types/content-studio.types";
import { ContentStudioTaskStore } from "./content-studio-task-store";
import { ContentStudioImageService } from "./content-studio-image.service";

export class ContentStudioLayoutService {
  constructor(
    private readonly taskStore: ContentStudioTaskStore,
    private readonly imageService: ContentStudioImageService
  ) {}

  async saveImagePlan(taskId: string, updates: ContentStudioParagraphImagePlanUpdate[]): Promise<ContentStudioTask> {
    const task = await this.taskStore.getTaskById(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    if (!task.result) {
      throw new Error("当前任务没有可编辑的文章结果");
    }

    const validParagraphIds = new Set(task.result.paragraphs.map((paragraph) => paragraph.paragraphId));
    for (const update of updates) {
      const paragraphId = String(update.paragraphId || "").trim();
      if (!validParagraphIds.has(paragraphId)) {
        throw new Error(`段落不存在：${paragraphId}`);
      }
    }

    const updateMap = new Map(
      updates.map((update) => [String(update.paragraphId || "").trim(), update.imagePlan])
    );

    const nextParagraphs = task.result.paragraphs.map((paragraph) => {
      const nextPlan = updateMap.get(paragraph.paragraphId);
      if (nextPlan === undefined) {
        return paragraph;
      }
      return {
        ...paragraph,
        imagePlan: nextPlan
      };
    });

    return this.taskStore.saveTask({
      ...task,
      result: {
        ...task.result,
        paragraphs: nextParagraphs
      }
    });
  }

  async addLocalImage(taskId: string, sourceImagePath: string): Promise<ContentStudioTask> {
    const task = await this.taskStore.getTaskById(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }

    const taskDir = await this.taskStore.getTaskDirPath(taskId);
    const imagesDir = join(taskDir, "images");
    const sourceBaseName = basename(sourceImagePath);
    const extension = extname(sourceBaseName);
    const baseName = sourceBaseName.slice(0, sourceBaseName.length - extension.length) || "image";
    const assetId = randomUUID();
    const fileName = `${baseName}-${assetId.slice(0, 8)}${extension || ".png"}`;
    const targetPath = join(imagesDir, fileName);

    await copyFile(sourceImagePath, targetPath);

    const nextAsset: ContentStudioImageAsset = {
      assetId,
      sourceType: "local_upload",
      fileName,
      localPath: targetPath,
      createdAt: new Date().toISOString()
    };

    return this.taskStore.saveTask({
      ...task,
      imageAssets: [...task.imageAssets, nextAsset]
    });
  }

  async bindImage(taskId: string, paragraphId: string, assetId: string): Promise<ContentStudioTask> {
    const task = await this.taskStore.getTaskById(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    if (!task.result) {
      throw new Error("当前任务没有文章内容");
    }

    const paragraphExists = task.result.paragraphs.some((paragraph) => paragraph.paragraphId === paragraphId);
    if (!paragraphExists) {
      throw new Error("段落不存在");
    }

    const assetExists = task.imageAssets.some((asset) => asset.assetId === assetId);
    if (!assetExists) {
      throw new Error("图片资源不存在");
    }

    const current = task.imageBindings ?? [];
    const next = current.filter((item) => item.paragraphId !== paragraphId);
    next.push({ paragraphId, assetId });

    return this.taskStore.saveTask({
      ...task,
      imageBindings: next
    });
  }

  async unbindImage(taskId: string, paragraphId: string): Promise<ContentStudioTask> {
    const task = await this.taskStore.getTaskById(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }

    return this.taskStore.saveTask({
      ...task,
      imageBindings: (task.imageBindings ?? []).filter((item) => item.paragraphId !== paragraphId)
    });
  }

  async deleteImage(taskId: string, assetId: string): Promise<ContentStudioTask> {
    const task = await this.taskStore.getTaskById(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }

    const asset = task.imageAssets.find((item) => item.assetId === assetId);
    if (!asset) {
      throw new Error("图片资源不存在");
    }

    await rm(asset.localPath, { force: true });

    return this.taskStore.saveTask({
      ...task,
      imageAssets: task.imageAssets.filter((item) => item.assetId !== assetId),
      imageBindings: (task.imageBindings ?? []).filter((item) => item.assetId !== assetId)
    });
  }

  async buildPublishDraft(taskId: string): Promise<string> {
    const task = await this.taskStore.getTaskById(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    if (!task.result) {
      throw new Error("当前任务没有文章内容");
    }

    const lines: string[] = [];
    lines.push(task.result.title || task.title);
    lines.push("");
    lines.push(`封面主文案：${task.result.coverText || "未提供"}`);
    lines.push(`封面副文案：${task.result.coverSubText || "未提供"}`);
    lines.push("");

    const bindings = task.imageBindings ?? [];

    task.result.paragraphs.forEach((paragraph, index) => {
      lines.push(`正文段落 ${index + 1}`);
      lines.push(paragraph.text);

      const binding = bindings.find((item) => item.paragraphId === paragraph.paragraphId);
      if (binding) {
        lines.push(`[配图：已绑定 ${binding.assetId}]`);
      } else if (paragraph.imagePlan?.caption) {
        lines.push(`[配图：未绑定，建议：${paragraph.imagePlan.caption}]`);
      } else {
        lines.push("[配图：未绑定]");
      }
      lines.push("");
    });

    lines.push(`标签：${task.result.tags?.join("、") || "未提供"}`);
    lines.push(`风险提示：${task.result.riskNotes?.join("；") || "未提供"}`);
    return lines.join("\n");
  }

  async generateAiImage(taskId: string, options: ContentStudioGenerateImageOptions): Promise<ContentStudioTask> {
    const task = await this.taskStore.getTaskById(taskId);
    if (!task) {
      throw new Error("任务不存在");
    }
    if (!task.result) {
      throw new Error("当前任务没有文章内容");
    }

    const paragraphId = options.paragraphId?.trim();
    if (paragraphId && !task.result.paragraphs.some((paragraph) => paragraph.paragraphId === paragraphId)) {
      throw new Error(`段落不存在：${paragraphId}`);
    }

    const taskDir = await this.taskStore.getTaskDirPath(taskId);
    const taskImagesDir = join(taskDir, "images");
    const generated = await this.imageService.generateImage(taskId, taskImagesDir, options);
    const assetId = randomUUID();
    const fileName = basename(generated.localPath);

    let imageBindings = task.imageBindings ?? [];
    if (options.bindAfterGenerate && paragraphId) {
      imageBindings = imageBindings.filter((item) => item.paragraphId !== paragraphId);
      imageBindings.push({ paragraphId, assetId });
    }

    return this.taskStore.saveTask({
      ...task,
      imageAssets: [
        ...task.imageAssets,
        {
          assetId,
          sourceType: "generated",
          fileName,
          localPath: generated.localPath,
          createdAt: new Date().toISOString(),
          caption: generated.prompt,
          sourceRef: generated.sourceRef
        }
      ],
      imageBindings
    });
  }
}
