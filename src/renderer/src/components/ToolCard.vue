<script setup lang="ts">
const props = defineProps<{
  title: string;
  description: string;
  status: "available" | "coming-soon";
  blocked?: boolean;
  blockedReason?: string;
  actionLabel?: string;
  clickableWhenBlocked?: boolean;
}>();

const emit = defineEmits<{
  click: [];
  action: [];
}>();

function handleCardClick(): void {
  if (props.status !== "available") {
    return;
  }

  if (props.blocked && !props.clickableWhenBlocked) {
    return;
  }
  emit("click");
}
</script>

<template>
  <button
    class="tool-card"
    :class="[status, { blocked: Boolean(blocked) }]"
    :disabled="status !== 'available'"
    @click="handleCardClick"
  >
    <div class="card-top">
      <span class="badge">{{ status === "available" ? "可用" : "即将上线" }}</span>
      <button
        v-if="actionLabel"
        class="action-btn"
        type="button"
        @click.stop="$emit('action')"
      >
        {{ actionLabel }}
      </button>
    </div>

    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <p v-if="blockedReason" class="blocked-tip">{{ blockedReason }}</p>
  </button>
</template>

<style scoped>
.tool-card {
  position: relative;
  padding: 26px;
  min-height: 186px;
  border-radius: 24px;
  border: 1px solid rgba(151, 183, 255, 0.14);
  background:
    linear-gradient(160deg, rgba(22, 36, 64, 0.96), rgba(9, 15, 28, 0.92)),
    linear-gradient(135deg, rgba(93, 170, 255, 0.2), transparent);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.tool-card.available:hover {
  transform: translateY(-3px);
  border-color: rgba(108, 174, 255, 0.46);
  box-shadow: 0 24px 60px rgba(3, 10, 24, 0.44);
}

.tool-card.coming-soon {
  opacity: 0.7;
  cursor: not-allowed;
}

.tool-card.blocked {
  border-color: rgba(255, 170, 142, 0.32);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.badge {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(111, 189, 255, 0.14);
  color: #80c2ff;
}

.action-btn {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(143, 176, 255, 0.25);
  background: rgba(255, 255, 255, 0.06);
  color: #eaf3ff;
  font-size: 12px;
  cursor: pointer;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

h3 {
  margin: 18px 0 12px;
  font-size: 24px;
}

p {
  margin: 0;
  color: #a7bbdc;
  line-height: 1.6;
}

.blocked-tip {
  margin-top: 12px;
  color: #ffc1a8;
  font-size: 13px;
}
</style>
