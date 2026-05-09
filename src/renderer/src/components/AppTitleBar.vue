<template>
  <header class="title-bar">
    <div class="title-copy">
      <span class="eyebrow">AI Studio</span>
      <strong>AI 自媒体工具箱</strong>
    </div>
    <p class="title-meta">视频转图文 MVP</p>
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

.title-meta {
  margin: 0;
  font-size: 12px;
  color: #93add3;
}
</style>
