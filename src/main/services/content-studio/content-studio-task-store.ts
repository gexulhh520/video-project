import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  ContentStudioImageAsset,
  ContentStudioImagePlanType,
  ContentStudioParagraphImageBinding,
  ContentStudioTabKey,
  ContentStudioTabModelSettings,
  ContentStudioTask,
  ContentStudioTaskSummary
} from "../../types/content-studio.types";
import { SettingsService } from "../settings.service";

export class ContentStudioTaskStore {
  constructor(private readonly settingsService: SettingsService) {}

  async createTask(
    tab: ContentStudioTabKey,
    title: string,
    input: unknown,
    settingsSnapshot: ContentStudioTabModelSettings
  ): Promise<ContentStudioTask> {
    const now = new Date().toISOString();
    const task: ContentStudioTask = {
      taskId: randomUUID(),
      tab,
      title,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      input,
      settingsSnapshot,
      debateSteps: [],
      imageAssets: []
    };

    await this.saveTask(task);
    return task;
  }

  async saveTask(task: ContentStudioTask): Promise<ContentStudioTask> {
    const taskDir = await this.getTaskDir(task.taskId);
    await mkdir(taskDir, { recursive: true });
    await mkdir(join(taskDir, "images"), { recursive: true });
    await mkdir(join(taskDir, "exports"), { recursive: true });

    const nextTask: ContentStudioTask = {
      ...task,
      updatedAt: new Date().toISOString()
    };

    await writeFile(join(taskDir, "task.json"), JSON.stringify(nextTask, null, 2), "utf8");
    return nextTask;
  }

  async getTaskById(taskId: string): Promise<ContentStudioTask | null> {
    try {
      const content = await readFile(join(await this.getTaskDir(taskId), "task.json"), "utf8");
      const parsed = JSON.parse(content) as ContentStudioTask;
      return this.normalizeTask(parsed);
    } catch {
      return null;
    }
  }

  async listTasks(): Promise<ContentStudioTaskSummary[]> {
    const tasksDir = await this.getTasksRootDir();
    await mkdir(tasksDir, { recursive: true });
    const entries = await readdir(tasksDir, { withFileTypes: true });

    const summaries = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const task = await this.getTaskById(entry.name);
          if (!task) {
            return null;
          }

          return {
            taskId: task.taskId,
            tab: task.tab,
            title: task.title,
            status: task.status,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt
          } as ContentStudioTaskSummary;
        })
    );

    return summaries
      .filter((summary): summary is ContentStudioTaskSummary => Boolean(summary))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteTask(taskId: string): Promise<void> {
    await rm(await this.getTaskDir(taskId), { recursive: true, force: true });
  }

  async getTaskDirPath(taskId: string): Promise<string> {
    return this.getTaskDir(taskId);
  }

  private async getTasksRootDir(): Promise<string> {
    const workspaceDir = (await this.settingsService.getSettings()).workspaceDir;
    return join(workspaceDir, "content-studio", "tasks");
  }

  private async getTaskDir(taskId: string): Promise<string> {
    return join(await this.getTasksRootDir(), taskId);
  }

  private normalizeTask(task: ContentStudioTask): ContentStudioTask {
    const imageAssets = this.normalizeImageAssets(task.imageAssets);
    const validAssetIds = new Set(imageAssets.map((asset) => asset.assetId));
    const imageBindings = this.normalizeImageBindings(task.imageBindings, validAssetIds);
    const result = task.result
      ? {
          ...task.result,
          paragraphs: task.result.paragraphs.map((paragraph, index) => ({
            ...paragraph,
            paragraphId: String(paragraph.paragraphId || `p${index + 1}`),
            imagePlan: paragraph.imagePlan
              ? {
                  type: this.normalizeImagePlanType(paragraph.imagePlan.type),
                  caption: paragraph.imagePlan.caption,
                  prompt: paragraph.imagePlan.prompt
                }
              : undefined
          }))
        }
      : undefined;

    return {
      ...task,
      imageAssets,
      imageBindings,
      result
    };
  }

  private normalizeImageAssets(assets: unknown): ContentStudioImageAsset[] {
    if (!Array.isArray(assets)) {
      return [];
    }
    const normalized: ContentStudioImageAsset[] = [];
    assets.forEach((item, index) => {
        const value = item as Partial<ContentStudioImageAsset> | null;
        if (!value || typeof value !== "object") {
          return;
        }
        const localPath = String(value.localPath || "").trim();
        if (!localPath) {
          return;
        }
        const fileName = String(value.fileName || "").trim() || `legacy-image-${index + 1}`;
        const sourceType = value.sourceType === "generated" || value.sourceType === "source" || value.sourceType === "local_upload"
          ? value.sourceType
          : "local_upload";
        const asset: ContentStudioImageAsset = {
          assetId: String(value.assetId || `legacy-asset-${index + 1}`),
          sourceType,
          fileName,
          localPath,
          createdAt: String(value.createdAt || new Date(0).toISOString())
        };
        if (value.caption) {
          asset.caption = String(value.caption);
        }
        normalized.push(asset);
      });
    return normalized;
  }

  private normalizeImageBindings(
    bindings: unknown,
    validAssetIds: Set<string>
  ): ContentStudioParagraphImageBinding[] {
    if (!Array.isArray(bindings)) {
      return [];
    }
    const normalized: ContentStudioParagraphImageBinding[] = [];
    bindings.forEach((item) => {
        const value = item as Partial<ContentStudioParagraphImageBinding> | null;
        if (!value || typeof value !== "object") {
          return;
        }
        const paragraphId = String(value.paragraphId || "").trim();
        const assetId = String(value.assetId || "").trim();
        if (!paragraphId || !assetId || !validAssetIds.has(assetId)) {
          return;
        }
        const binding: ContentStudioParagraphImageBinding = {
          paragraphId,
          assetId
        };
        if (value.caption) {
          binding.caption = String(value.caption);
        }
        normalized.push(binding);
      });

    const dedupMap = new Map<string, ContentStudioParagraphImageBinding>();
    for (const binding of normalized) {
      dedupMap.set(binding.paragraphId, binding);
    }
    return [...dedupMap.values()];
  }

  private normalizeImagePlanType(type: string | undefined): ContentStudioImagePlanType {
    if (type === "source_image" || type === "ai_generated" || type === "infographic" || type === "none") {
      return type;
    }
    return "none";
  }
}
