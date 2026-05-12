<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

const emit = defineEmits<{
  authorized: [];
}>();

const loading = ref(true);
const machineId = ref("");
const licenseKey = ref("");
const reason = ref("");
const activating = ref(false);

const actionText = computed(() => {
  if (reason.value.includes("过期")) {
    return "更新授权";
  }

  return "激活软件";
});

onMounted(async () => {
  const status = await window.desktopApi.checkLicense();
  machineId.value = status.machineId;

  if (status.authorized) {
    emit("authorized");
    return;
  }

  reason.value = status.reason || "当前软件未授权。";
  loading.value = false;
});

async function activate(): Promise<void> {
  if (!licenseKey.value.trim() || activating.value) {
    return;
  }

  activating.value = true;
  reason.value = "";

  try {
    const status = await window.desktopApi.activateLicense(licenseKey.value.trim());
    machineId.value = status.machineId;

    if (status.authorized) {
      emit("authorized");
      return;
    }

    reason.value = status.reason || "授权失败。";
  } finally {
    activating.value = false;
  }
}

async function copyMachineId(): Promise<void> {
  await navigator.clipboard.writeText(machineId.value);
}
</script>

<template>
  <div class="license-page">
    <div class="license-card">
      <h1>软件授权</h1>
      <p>请复制当前机器码发送给管理员，获取授权码后激活软件。</p>

      <div v-if="loading">正在检查授权...</div>

      <template v-else>
        <label>
          <span>当前机器码</span>
          <textarea :value="machineId" rows="3" readonly />
        </label>

        <button class="secondary-btn" @click="copyMachineId">复制机器码</button>

        <p v-if="reason" class="error">{{ reason }}</p>

        <label>
          <span>授权码</span>
          <textarea v-model="licenseKey" rows="8" placeholder="请粘贴授权码" />
        </label>

        <button :disabled="!licenseKey.trim() || activating" @click="activate">
          {{ activating ? "校验中..." : actionText }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.license-page {
  height: 100%;
  display: grid;
  place-items: center;
  background: #08111f;
  color: #eaf3ff;
}

.license-card {
  width: min(680px, calc(100vw - 40px));
  padding: 32px;
  border-radius: 24px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(140, 173, 247, 0.18);
}

h1 {
  margin: 0 0 12px;
}

label {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}

span {
  color: #9db4d8;
  font-size: 13px;
}

textarea {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(149, 181, 255, 0.16);
  background: rgba(255, 255, 255, 0.04);
  color: #edf5ff;
  padding: 14px;
  outline: none;
  resize: vertical;
}

button {
  width: 100%;
  margin-top: 20px;
  min-height: 48px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #6bc3ff, #3f7df7);
  color: #06111f;
  font-weight: 700;
  cursor: pointer;
}

.secondary-btn {
  background: rgba(255, 255, 255, 0.06);
  color: #eaf3ff;
  border: 1px solid rgba(149, 181, 255, 0.16);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin-top: 16px;
  color: #ffb4b4;
  line-height: 1.6;
}
</style>
