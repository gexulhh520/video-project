import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
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
      return JSON.parse(content) as ContentStudioTask;
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

  private async getTasksRootDir(): Promise<string> {
    const workspaceDir = (await this.settingsService.getSettings()).workspaceDir;
    return join(workspaceDir, "content-studio", "tasks");
  }

  private async getTaskDir(taskId: string): Promise<string> {
    return join(await this.getTasksRootDir(), taskId);
  }
}
