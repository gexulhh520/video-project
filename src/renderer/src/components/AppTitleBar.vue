<script setup lang="ts">
defineProps<{
  licenseRemainingText?: string;
  canRenew?: boolean;
}>();

const emit = defineEmits<{
  renew: [];
}>();
</script>

<template>
  <header class="title-bar">
    <div class="title-copy">
      <span class="eyebrow">AI Studio</span>
      <strong>AI 自媒体工具箱</strong>
    </div>
    <div class="title-right">
      <p v-if="licenseRemainingText" class="license-meta">{{ licenseRemainingText }}</p>
      <button v-if="canRenew" class="renew-btn" @click="emit('renew')">重新授权</button>
      <p class="title-meta">视频转图文 MVP</p>
    </div>
  </header>
</template>

<style scoped>
.title-bar {
  height: 68px;
  padding: 18px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(152, 185, 255, 0.14);
  background: rgba(7, 12, 22, 0.7);
  backdrop-filter: blur(16px);
  -webkit-app-region: drag;
}

.title-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #88a3cf;
}

.title-copy strong {
  font-size: 18px;
  font-weight: 700;
}

.title-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-meta {
  margin: 0;
  font-size: 12px;
  color: #93add3;
}

.license-meta {
  margin: 0;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1;
  color: #dff3ff;
  background: rgba(70, 151, 255, 0.2);
  border: 1px solid rgba(128, 194, 255, 0.28);
}

.renew-btn {
  -webkit-app-region: no-drag;
  border: 1px solid rgba(149, 181, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: #eaf3ff;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}

.renew-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}
</style>
