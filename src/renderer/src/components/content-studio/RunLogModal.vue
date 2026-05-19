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
      <div class="log-scroll">
        <pre>{{ description }}</pre>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; z-index: 66; display: grid; place-items: center; background: rgba(5,10,20,0.7); }
.modal-card { width: min(840px, calc(100vw - 48px)); max-height: min(88vh, 920px); padding: 20px; border-radius: 16px; border: 1px solid rgba(149,181,255,0.16); background: #0e1626; display: grid; gap: 12px; }
.modal-header { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
.close-btn { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); background: rgba(255,255,255,0.03); color: #eaf3ff; cursor: pointer; }
.log-scroll { min-height: 220px; max-height: min(72vh, 760px); overflow-y: auto; border: 1px solid rgba(149,181,255,0.14); border-radius: 12px; background: rgba(255,255,255,0.02); padding: 12px; }
pre { margin: 0; color: #9cb3d7; white-space: pre-wrap; word-break: break-word; line-height: 1.45; font-size: 12px; }
</style>
