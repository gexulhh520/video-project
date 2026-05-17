<script setup lang="ts">
const props = defineProps<{
  open: boolean;
  text: string;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div v-if="props.open" class="modal-overlay" @click.self="emit('close')">
    <section class="modal-card">
      <header class="modal-header">
        <h3>复制失败，请手动复制</h3>
        <button class="ghost-btn" @click="emit('close')">关闭</button>
      </header>
      <textarea readonly :value="props.text" rows="16"></textarea>
    </section>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; z-index: 75; display: grid; place-items: center; background: rgba(5,10,20,0.7); }
.modal-card { width: min(920px, calc(100vw - 40px)); max-height: 86vh; overflow: auto; padding: 20px; border-radius: 16px; border: 1px solid rgba(149,181,255,0.16); background: #0e1626; display: grid; gap: 12px; }
.modal-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.modal-header h3 { margin: 0; color: #eaf3ff; }
textarea { width: 100%; resize: vertical; border-radius: 10px; border: 1px solid rgba(140,173,247,0.2); background: rgba(255,255,255,0.03); color: #eaf3ff; padding: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.ghost-btn { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); background: rgba(255,255,255,0.03); color: #eaf3ff; cursor: pointer; }
</style>
