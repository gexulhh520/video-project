# video-to-post

Electron + Vue 3 + TypeScript 的桌面端 MVP，用来把本地视频处理成图文混排草稿。

## 当前已完成

- 工具箱首页，含 4 个工具卡片
- “视频转图文”工具页
- Electron 主进程服务链路
- FFmpeg 音频抽取、切片、抽帧封装
- 豆包 ASR 服务封装
- OpenAI-compatible LLM 服务封装
- 草稿 JSON 与本地产物落盘到 `app-data/`

## 运行前准备

1. 安装依赖
   `npm install`
2. 配置根目录 `.env`
3. 将 `ffmpeg.exe` 放到 `resources/ffmpeg/win/ffmpeg.exe`
   如果你的系统已经全局安装 `ffmpeg`，项目也会自动回退使用系统命令

## 开发命令

```bash
npm run dev
```

## 构建命令

```bash
npm run build
```

## 目录说明

- `src/main`: Electron 主进程、IPC、后端服务
- `src/preload`: preload 桥接层
- `src/renderer`: Vue 前端
- `app-data`: 视频、音频、切片、帧图、草稿输出目录
