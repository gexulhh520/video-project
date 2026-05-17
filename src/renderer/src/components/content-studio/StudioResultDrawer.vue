<script setup lang="ts">
const props = defineProps<{
  open: boolean;
  title: string;
  summary: string;
}>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <aside v-if="open" class="drawer-mask" @click.self="emit('close')">
    <section class="drawer">
      <header>
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="emit('close')">关闭</button>
      </header>
      <p>{{ summary }}</p>
    </section>
  </aside>
</template>

<style scoped>
.drawer-mask { position: fixed; inset: 0; z-index: 67; display: flex; justify-content: flex-end; background: rgba(5,10,20,0.5); }
.drawer { width: min(560px, calc(100vw - 24px)); height: 100%; padding: 20px; background: #0e1626; border-left: 1px solid rgba(149,181,255,0.16); }
header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.close-btn { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(140,173,247,0.14); background: rgba(255,255,255,0.03); color: #eaf3ff; cursor: pointer; }
p { color: #9cb3d7; }
</style>
