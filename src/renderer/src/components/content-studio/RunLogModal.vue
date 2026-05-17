<script setup lang="ts">
const props = defineProps<{ open: boolean; title: string; description: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <header class="modal-header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </header>
      <p>{{ description }}</p>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; z-index: 66; display: grid; place-items: center; background: rgba(5,10,20,0.7); }
.modal-card { width: min(640px, calc(100vw - 48px)); padding: 20px; border-radius: 16px; border: 1px solid rgba(149,181,255,0.16); background: #0e1626; }
.modal-header { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.close-btn { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); background: rgba(255,255,255,0.03); color: #eaf3ff; cursor: pointer; }
p { color: #9cb3d7; }
</style>
