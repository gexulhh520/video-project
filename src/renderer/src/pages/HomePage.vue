<script setup lang="ts">
import { useRouter } from "vue-router";
import ToolCard from "../components/ToolCard.vue";

const router = useRouter();

const tools = [
  {
    title: "视频转图文",
    description: "导入本地视频，自动识别字幕、生成图文段落并从关键时间点抽图。",
    status: "available" as const,
    route: "/tools/video-to-post"
  },
  {
    title: "图文改写",
    description: "对现有图文内容做风格迁移、结构优化和平台适配。",
    status: "coming-soon" as const
  },
  {
    title: "爆款标题生成",
    description: "基于内容主题自动生成更适合分发场景的标题方案。",
    status: "coming-soon" as const
  },
  {
    title: "封面文案生成",
    description: "输出封面主文案与副标题候选，方便直接用于封面图。",
    status: "coming-soon" as const
  }
];
</script>

<template>
  <section class="home-page">
    <div class="hero">
      <span class="eyebrow">Toolbox</span>
      <h1>从一段视频，跑通一份可预览的图文草稿。</h1>
      <p>第一阶段先把“视频 → 音频 → ASR → LLM → 抽图 → 图文混排”完整打通。</p>
    </div>

    <div class="tool-grid">
      <ToolCard
        v-for="tool in tools"
        :key="tool.title"
        :title="tool.title"
        :description="tool.description"
        :status="tool.status"
        @click="tool.route ? router.push(tool.route) : undefined"
      />
    </div>
  </section>
</template>

<style scoped>
.home-page {
  height: 100%;
  padding: 36px 40px 42px;
  overflow: auto;
}

.hero {
  max-width: 820px;
  margin-bottom: 30px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #79c8ff;
}

h1 {
  margin: 12px 0 16px;
  font-size: 52px;
  line-height: 1.05;
}

p {
  margin: 0;
  color: #9cb3d7;
  font-size: 17px;
  line-height: 1.8;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

@media (max-width: 980px) {
  .tool-grid {
    grid-template-columns: 1fr;
  }

  h1 {
    font-size: 38px;
  }
}
</style>
