<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { desktopApi } from "./api/desktop-api";
import AppTitleBar from "./components/AppTitleBar.vue";
import LicenseGate from "./components/LicenseGate.vue";

const authorized = ref(false);
const licenseEnabled = ref(false);
const expiresAt = ref<string | null>(null);
const renewModalOpen = ref(false);
const renewLicenseKey = ref("");
const renewMessage = ref("");
const renewing = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const licenseRemainingText = computed(() => {
  if (!expiresAt.value) return "";

  const expiresMs = new Date(expiresAt.value).getTime();
  if (Number.isNaN(expiresMs)) return "";

  const diffMs = expiresMs - Date.now();
  if (diffMs <= 0) return "授权已过期";

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) {
    return `授权剩余 ${days}天 ${hours}小时`;
  }

  return `授权剩余 ${hours}小时 ${minutes}分钟`;
});

const canRenew = computed(() => licenseEnabled.value && authorized.value);

async function refreshLicenseInfo(): Promise<void> {
  const status = await desktopApi.checkLicense();
  authorized.value = status.authorized;
  licenseEnabled.value = status.enabled;

  if (!status.enabled || !status.license?.expiresAt) {
    expiresAt.value = null;
    return;
  }

  expiresAt.value = status.license.expiresAt;
}

async function handleAuthorized(): Promise<void> {
  authorized.value = true;
  await refreshLicenseInfo();
}

function openRenewModal(): void {
  renewModalOpen.value = true;
  renewLicenseKey.value = "";
  renewMessage.value = "";
}

function closeRenewModal(): void {
  if (renewing.value) return;
  renewModalOpen.value = false;
}

async function submitRenewLicense(): Promise<void> {
  if (!renewLicenseKey.value.trim() || renewing.value) return;

  renewing.value = true;
  renewMessage.value = "";

  try {
    const status = await desktopApi.activateLicense(renewLicenseKey.value.trim());
    if (!status.authorized) {
      renewMessage.value = status.reason || "授权失败，请检查授权码。";
      return;
    }

    renewMessage.value = "授权更新成功。";
    await refreshLicenseInfo();
    renewModalOpen.value = false;
  } finally {
    renewing.value = false;
  }
}

onMounted(async () => {
  await refreshLicenseInfo();

  timer = setInterval(() => {
    if (authorized.value) {
      void refreshLicenseInfo();
    }
  }, 60 * 1000);
});

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});
</script>

<template>
  <div class="app-shell">
    <AppTitleBar
      :license-remaining-text="licenseRemainingText"
      :can-renew="canRenew"
      @renew="openRenewModal"
    />
    <main class="app-main">
      <LicenseGate v-if="!authorized" @authorized="handleAuthorized" />
      <router-view v-else />
    </main>

    <div v-if="renewModalOpen" class="renew-mask" @click.self="closeRenewModal">
      <div class="renew-dialog">
        <h3>重新授权</h3>
        <p>请粘贴新的授权码，成功后会覆盖当前授权。</p>
        <textarea v-model="renewLicenseKey" rows="7" placeholder="请粘贴授权码" />
        <p v-if="renewMessage" class="renew-message">{{ renewMessage }}</p>
        <div class="renew-actions">
          <button class="secondary" :disabled="renewing" @click="closeRenewModal">取消</button>
          <button :disabled="!renewLicenseKey.trim() || renewing" @click="submitRenewLicense">
            {{ renewing ? "校验中..." : "确认授权" }}
          </button>
        </div>
      </div>
    </div>
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

.renew-mask {
  position: fixed;
  inset: 0;
  background: rgba(1, 7, 15, 0.58);
  display: grid;
  place-items: center;
  z-index: 30;
}

.renew-dialog {
  width: min(640px, calc(100vw - 40px));
  padding: 24px;
  border-radius: 18px;
  border: 1px solid rgba(149, 181, 255, 0.22);
  background: #0f1728;
}

.renew-dialog h3 {
  margin: 0;
}

.renew-dialog p {
  color: #9db4d8;
}

.renew-dialog textarea {
  width: 100%;
  margin-top: 10px;
  border-radius: 12px;
  border: 1px solid rgba(149, 181, 255, 0.2);
  background: rgba(255, 255, 255, 0.04);
  color: #edf5ff;
  padding: 12px;
  resize: vertical;
}

.renew-message {
  margin-top: 10px;
  color: #ffb4b4;
}

.renew-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.renew-actions button {
  min-width: 100px;
  min-height: 38px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #6bc3ff, #3f7df7);
  color: #06111f;
  font-weight: 700;
  cursor: pointer;
}

.renew-actions .secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #eaf3ff;
  border: 1px solid rgba(149, 181, 255, 0.2);
}

.renew-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
