<script setup lang="ts">
import AppTitleBar from "./components/AppTitleBar.vue";
</script>

<template>
  <div class="app-shell">
    <AppTitleBar />
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top, rgba(36, 74, 120, 0.34), transparent 30%),
    linear-gradient(180deg, #08111f 0%, #0c1320 55%, #090d15 100%);
  color: #edf5ff;
}

.app-main {
  flex: 1;
  overflow: hidden;
}
</style>
