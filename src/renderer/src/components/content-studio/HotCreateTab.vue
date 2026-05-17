<script setup lang="ts">
const props = defineProps<{
  tabReady: boolean;
  missingItems: string[];
}>();

const emit = defineEmits<{
  openModelSettings: [];
  openRunLog: [];
}>();
</script>

<template>
  <section class="tab-panel">
    <header class="panel-header">
      <div>
        <h3>热点成文</h3>
        <p>采集热点素材并生成成文，强调事实边界与风控审稿。</p>
      </div>
      <div class="header-actions">
        <button class="ghost-btn" @click="emit('openRunLog')">运行记录</button>
        <button class="ghost-btn" @click="emit('openModelSettings')">模型配置</button>
      </div>
    </header>

    <p v-if="!props.tabReady" class="warning">当前配置未完成：{{ props.missingItems.join("、") || "请先配置模型" }}</p>

    <div class="form-grid">
      <label class="field">
        <span>关键词 / 垂直领域</span>
        <input type="text" placeholder="例如：AI Agent, 教育, 电商" />
      </label>
      <label class="field">
        <span>平台</span>
        <select>
          <option>公众号</option>
          <option>今日头条</option>
          <option>小红书</option>
          <option>知乎</option>
        </select>
      </label>
      <label class="field">
        <span>热点来源</span>
        <select>
          <option>手动 + URL</option>
          <option>Google News</option>
          <option>Google Trends</option>
          <option>今日头条 Hot</option>
        </select>
      </label>
    </div>

    <div class="actions">
      <button class="ghost-btn" disabled>采集热点</button>
      <button class="primary-btn" :disabled="!props.tabReady">开始成文</button>
    </div>
  </section>
</template>

<style scoped>
.tab-panel { display: grid; gap: 16px; }
.panel-header { display: flex; justify-content: space-between; gap: 12px; }
.panel-header h3 { margin: 0; font-size: 26px; }
.panel-header p { margin: 8px 0 0; color: #9cb3d7; }
.header-actions, .actions { display: flex; gap: 10px; }
.form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.field { display: grid; gap: 8px; }
.field span { color: #9db4d8; font-size: 12px; }
.field input, .field select { min-height: 42px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(149,181,255,0.16); background: rgba(255,255,255,0.03); color: #edf5ff; }
.warning { margin: 0; color: #ffc1a8; }
.ghost-btn, .primary-btn { min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); cursor: pointer; font-weight: 600; }
.ghost-btn { background: rgba(255,255,255,0.03); color: #eaf3ff; }
.primary-btn { background: linear-gradient(135deg, #79f0d5, #47b9ff); color: #08111f; }
@media (max-width: 1100px) { .panel-header, .header-actions, .actions { flex-direction: column; align-items: stretch; } .form-grid { grid-template-columns: 1fr; } }
</style>
