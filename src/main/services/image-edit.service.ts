import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { PostDraft, SaveEditedFrameOptions } from "../types/app.types";
import { PostService } from "./post.service";
import { SettingsService } from "./settings.service";

export class ImageEditService {
  constructor(
    private readonly postService: PostService,
    private readonly settingsService: SettingsService
  ) {}

  async saveEditedFrame(options: SaveEditedFrameOptions): Promise<{ imagePath: string; updatedDraft: PostDraft }> {
    const draft = await this.postService.getDraftById(options.draftId);
    const targetBlock = draft.contentBlocks.find(
      (block): block is Extract<PostDraft["contentBlocks"][number], { type: "image" }> =>
        block.type === "image" && block.blockId === options.blockId
    );

    if (!targetBlock) {
      throw new Error("没有找到要替换的图片块。");
    }

    const workspaceDir = (await this.settingsService.getSettings()).workspaceDir;
    const editedDir = join(workspaceDir, "frames", options.draftId, "edited");
    await mkdir(editedDir, { recursive: true });

    const timestamp = Date.now();
    const extension = extname(options.sourceImagePath) || ".png";
    const editedFileName = `${options.blockId}_mosaic_${timestamp}${extension}`;
    const editedImagePath = join(editedDir, editedFileName);

    const base64Data = options.imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    await writeFile(editedImagePath, buffer);

    const originalImagePath = targetBlock.imagePath;
    targetBlock.imagePath = editedImagePath;
    targetBlock.time = options.time;
    targetBlock.sourceType = "video-frame";
    targetBlock.caption = `用户从视频 ${options.time.toFixed(1)}s 重新选帧并涂抹马赛克`;
    targetBlock.editMeta = {
      originalImagePath,
      editedImagePath,
      editedAt: new Date().toISOString(),
      effect: "mosaic"
    };

    const updatedDraft = await this.postService.saveDraft(draft);

    return {
      imagePath: editedImagePath,
      updatedDraft
    };
  }
}
