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
        <h3>图文排版</h3>
        <p>管理配图计划、图片池与导出能力，保持主页面简洁。</p>
      </div>
      <div class="header-actions">
        <button class="ghost-btn" @click="emit('openRunLog')">运行记录</button>
        <button class="ghost-btn" @click="emit('openModelSettings')">模型配置</button>
      </div>
    </header>

    <p v-if="!props.tabReady" class="warning">当前配置未完成：{{ props.missingItems.join("、") || "请先配置模型" }}</p>

    <div class="placeholder-box">
      <p>图文排版阶段将通过“配图计划”“图片池”等弹窗管理复杂参数，避免主页面拥挤。</p>
      <div class="actions">
        <button class="ghost-btn" disabled>配图计划</button>
        <button class="ghost-btn" disabled>图片池</button>
        <button class="primary-btn" :disabled="!props.tabReady">导出 Word</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tab-panel { display: grid; gap: 16px; }
.panel-header { display: flex; justify-content: space-between; gap: 12px; }
.panel-header h3 { margin: 0; font-size: 26px; }
.panel-header p { margin: 8px 0 0; color: #9cb3d7; }
.header-actions, .actions { display: flex; gap: 10px; flex-wrap: wrap; }
.warning { margin: 0; color: #ffc1a8; }
.placeholder-box { padding: 16px; border-radius: 14px; border: 1px solid rgba(149,181,255,0.12); background: rgba(255,255,255,0.02); display: grid; gap: 14px; }
.placeholder-box p { margin: 0; color: #9cb3d7; }
.ghost-btn, .primary-btn { min-height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); cursor: pointer; font-weight: 600; }
.ghost-btn { background: rgba(255,255,255,0.03); color: #eaf3ff; }
.primary-btn { background: linear-gradient(135deg, #79f0d5, #47b9ff); color: #08111f; }
@media (max-width: 1100px) { .panel-header, .header-actions, .actions { flex-direction: column; align-items: stretch; } }
</style>
