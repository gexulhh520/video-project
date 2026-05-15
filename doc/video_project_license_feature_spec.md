# 视频转图文工具：本地授权功能开发说明

> 项目：Electron + Vue3 + TypeScript 桌面端视频转图文工具  
> 目标：给软件增加可开关的本地授权机制。软件启动后先检查授权，未授权、授权过期、授权无效时显示授权页；授权成功后进入工具箱。  
> 新增要求：授权生成脚本支持直接填写有效天数，例如 `7`、`15`、`30`，表示从当前时间开始延长多少天；打包环境变量中增加开关，控制是否启用授权机制。

---

## 1. 功能目标

软件启动后先判断是否启用授权机制。

```text
启动软件
  ↓
读取授权开关 LICENSE_ENABLED
  ↓
LICENSE_ENABLED=false
  ↓
直接进入工具箱

LICENSE_ENABLED=true
  ↓
检查本地授权
  ↓
授权有效：进入工具箱
  ↓
未授权 / 授权过期 / 授权无效：显示授权页
  ↓
授权页显示当前机器码
  ↓
用户复制机器码发给管理员
  ↓
管理员用私钥生成授权码
  ↓
用户粘贴授权码激活
  ↓
公钥验签 + 机器码校验 + 时间校验 + 防时间回拨
  ↓
成功后保存授权码并进入系统
```

注意：授权机制采用 **私钥签名 + 公钥验签**，不是“私钥加密、公钥解密”。

---

## 2. 授权开关设计

### 2.1 env 配置

新增环境变量：

```env
LICENSE_ENABLED=true
```

含义：

```text
LICENSE_ENABLED=true
  启用本地授权机制，启动软件必须检查授权。

LICENSE_ENABLED=false
  关闭授权机制，软件直接进入主页面。
```

开发环境可以先关：

```env
LICENSE_ENABLED=false
```

正式打包售卖时打开：

```env
LICENSE_ENABLED=true
```

### 2.2 Main Process 判断

建议增加：

```ts
function isLicenseEnabled(): boolean {
  return process.env.LICENSE_ENABLED === "true";
}
```

授权检查时：

```ts
if (!isLicenseEnabled()) {
  return {
    authorized: true,
    machineId,
    reason: "授权机制未启用。"
  };
}
```

这样开发阶段不影响调试。

---

## 3. 授权整体架构

### 3.1 软件内置

软件内置：

```text
1. 公钥
2. 授权校验逻辑
3. 机器码生成逻辑
4. 授权页 LicenseGate
```

### 3.2 管理员本地保留

管理员自己电脑保留：

```text
1. private-key.pem
2. scripts/generate_license.ts
```

私钥不能提交 GitHub，不能打包进软件，不能发给用户。

---

## 4. 授权码 payload 结构

授权码解码后的 payload：

```json
{
  "licenseId": "lic_1710000000000",
  "machineId": "8f4a2c1d9cxxxx",
  "customer": "张三",
  "issuedAt": "2026-05-11T00:00:00.000Z",
  "expiresAt": "2026-06-10T00:00:00.000Z",
  "durationDays": 30,
  "features": ["video-to-post", "word-export"]
}
```

字段说明：

```text
licenseId     授权编号
machineId     用户电脑机器码
customer      用户名 / 客户名
issuedAt      授权签发时间
expiresAt     授权过期时间
durationDays  授权有效天数，方便查看
features      功能权限，第一版可以先固定
```

授权码格式：

```text
base64url(JSON.stringify(payload)) + "." + base64url(signature)
```

---

## 5. 授权脚本命令设计

管理员生成授权码时，命令支持两种写法。

### 5.1 推荐写法：传天数

```bash
npx tsx scripts/generate_license.ts 用户机器码 用户名 7
npx tsx scripts/generate_license.ts 用户机器码 用户名 15
npx tsx scripts/generate_license.ts 用户机器码 用户名 30
npx tsx scripts/generate_license.ts 用户机器码 用户名 365
```

含义：

```text
7    从当前时间开始，有效 7 天
15   从当前时间开始，有效 15 天
30   从当前时间开始，有效 30 天
365  从当前时间开始，有效 365 天
```

### 5.2 兼容写法：传 ISO 过期时间

```bash
npx tsx scripts/generate_license.ts 用户机器码 用户名 2026-12-31T23:59:59.000Z
```

如果第三个参数是数字，则按“有效天数”处理。  
如果第三个参数是时间字符串，则按“指定过期时间”处理。

---

## 6. 需要新增的文件

```text
src/main/services/machine.service.ts
src/main/services/license.service.ts
src/renderer/src/components/LicenseGate.vue
scripts/generate_license.ts
scripts/keys/private-key.pem
src/main/license/public-key.pem
```

---

## 7. 需要修改的文件

```text
src/main/types/app.types.ts
src/main/ipc.ts
src/preload/index.ts
src/renderer/src/api/desktop-api.ts
src/renderer/src/App.vue
.gitignore
package.json
.env
.env.production
```

---

## 8. .gitignore 修改

增加：

```gitignore
scripts/keys/private-key.pem
scripts/keys/*.pem
```

不要忽略公钥：

```text
src/main/license/public-key.pem 可以提交
```

---

## 9. 生成密钥对

在项目根目录执行：

```bash
mkdir -p scripts/keys
openssl genrsa -out scripts/keys/private-key.pem 2048
openssl rsa -in scripts/keys/private-key.pem -pubout -out src/main/license/public-key.pem
```

Windows 可以使用 Git Bash 或安装 OpenSSL。

---

## 10. 机器码生成服务

新增：

```text
src/main/services/machine.service.ts
```

```ts
import os from "node:os";
import crypto from "node:crypto";

function isValidMac(mac: string): boolean {
  if (!mac) return false;
  if (mac === "00:00:00:00:00:00") return false;
  if (mac === "ff:ff:ff:ff:ff:ff") return false;
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac);
}

function isLikelyVirtualInterface(name: string): boolean {
  const lower = name.toLowerCase();

  return [
    "virtual",
    "vmware",
    "vbox",
    "virtualbox",
    "hyper-v",
    "loopback",
    "docker",
    "wsl",
    "vpn",
    "tap",
    "npcap"
  ].some((keyword) => lower.includes(keyword));
}

export function getPrimaryMacAddress(): string {
  const interfaces = os.networkInterfaces();

  const candidates: Array<{
    name: string;
    mac: string;
  }> = [];

  for (const [name, list] of Object.entries(interfaces)) {
    if (!list || isLikelyVirtualInterface(name)) {
      continue;
    }

    for (const item of list) {
      if (item.internal) continue;
      if (!isValidMac(item.mac)) continue;

      candidates.push({
        name,
        mac: item.mac.toLowerCase()
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error("没有读取到有效的本机 MAC 地址。");
  }

  candidates.sort((a, b) => a.name.localeCompare(b.name));

  return candidates[0].mac;
}

export function getMachineId(): string {
  const mac = getPrimaryMacAddress();

  return crypto
    .createHash("sha256")
    .update(`video-project:${mac}`)
    .digest("hex");
}
```

---

## 11. 类型定义

修改：

```text
src/main/types/app.types.ts
```

新增：

```ts
export type LicensePayload = {
  licenseId: string;
  machineId: string;
  customer?: string;
  issuedAt?: string;
  expiresAt?: string;
  durationDays?: number;
  features?: string[];
};

export type LicenseStatus = {
  authorized: boolean;
  machineId: string;
  enabled: boolean;
  reason?: string;
  license?: LicensePayload;
};
```

`DesktopApi` 中增加：

```ts
getMachineId: () => Promise<string>;
checkLicense: () => Promise<LicenseStatus>;
activateLicense: (licenseKey: string) => Promise<LicenseStatus>;
```

---

## 12. 授权服务

新增：

```text
src/main/services/license.service.ts
```

```ts
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { getMachineId } from "./machine.service";
import type { LicensePayload, LicenseStatus } from "../types/app.types";

const CLOCK_ROLLBACK_TOLERANCE_MS = 10 * 60 * 1000;

const PUBLIC_KEY = `
-----BEGIN PUBLIC KEY-----
这里替换成 src/main/license/public-key.pem 的内容
-----END PUBLIC KEY-----
`;

type LicenseRuntimeState = {
  machineId: string;
  licenseHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

function isLicenseEnabled(): boolean {
  return process.env.LICENSE_ENABLED === "true";
}

function getLicenseFilePath(): string {
  return path.join(app.getPath("userData"), "license", "license.key");
}

function getLicenseStatePath(): string {
  return path.join(app.getPath("userData"), "license", "license-state.json");
}

function base64UrlDecode(value: string): Buffer {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");

  while (normalized.length % 4) {
    normalized += "=";
  }

  return Buffer.from(normalized, "base64");
}

function parseLicenseKey(licenseKey: string): {
  payloadText: string;
  payload: LicensePayload;
  signature: Buffer;
} {
  const [payloadPart, signaturePart] = licenseKey.trim().split(".");

  if (!payloadPart || !signaturePart) {
    throw new Error("授权码格式错误。");
  }

  const payloadText = base64UrlDecode(payloadPart).toString("utf-8");
  const payload = JSON.parse(payloadText) as LicensePayload;
  const signature = base64UrlDecode(signaturePart);

  return {
    payloadText,
    payload,
    signature
  };
}

function verifySignature(payloadText: string, signature: Buffer): boolean {
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(payloadText);
  verifier.end();

  return verifier.verify(PUBLIC_KEY, signature);
}

function parseTime(value?: string): number | null {
  if (!value) return null;

  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;

  return time;
}

function checkLicenseTime(payload: LicensePayload): void {
  const now = Date.now();

  const issuedAt = parseTime(payload.issuedAt);
  const expiresAt = parseTime(payload.expiresAt);

  if (issuedAt && now + CLOCK_ROLLBACK_TOLERANCE_MS < issuedAt) {
    throw new Error("系统时间异常：当前时间早于授权签发时间，请恢复正确时间。");
  }

  if (!expiresAt) {
    throw new Error("授权码缺少过期时间。");
  }

  if (now > expiresAt) {
    throw new Error("授权码已过期，请联系管理员重新获取授权码。");
  }
}

function checkClockRollback(lastSeenAt?: string): void {
  if (!lastSeenAt) return;

  const now = Date.now();
  const lastSeenTime = parseTime(lastSeenAt);

  if (!lastSeenTime) return;

  if (now + CLOCK_ROLLBACK_TOLERANCE_MS < lastSeenTime) {
    throw new Error("检测到系统时间被回调，请恢复正确时间后重新启动软件。");
  }
}

function getLicenseHash(licenseKey: string): string {
  return crypto.createHash("sha256").update(licenseKey.trim()).digest("hex");
}

async function readLicenseState(): Promise<LicenseRuntimeState | null> {
  const statePath = getLicenseStatePath();

  if (!existsSync(statePath)) {
    return null;
  }

  const content = await readFile(statePath, "utf-8");
  return JSON.parse(content) as LicenseRuntimeState;
}

async function saveLicenseState(state: LicenseRuntimeState): Promise<void> {
  const statePath = getLicenseStatePath();

  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

export class LicenseService {
  async getMachineId(): Promise<string> {
    return getMachineId();
  }

  async checkLocalLicense(): Promise<LicenseStatus> {
    const machineId = getMachineId();
    const enabled = isLicenseEnabled();

    if (!enabled) {
      return {
        authorized: true,
        enabled,
        machineId,
        reason: "授权机制未启用。"
      };
    }

    const licensePath = getLicenseFilePath();

    if (!existsSync(licensePath)) {
      return {
        authorized: false,
        enabled,
        machineId,
        reason: "当前软件未授权。"
      };
    }

    const licenseKey = await readFile(licensePath, "utf-8");
    return this.verifyLicenseKey(licenseKey);
  }

  async activate(licenseKey: string): Promise<LicenseStatus> {
    const status = await this.verifyLicenseKey(licenseKey);

    if (!status.authorized) {
      return status;
    }

    const licensePath = getLicenseFilePath();
    await mkdir(path.dirname(licensePath), { recursive: true });

    // 重新授权时直接覆盖旧授权码
    await writeFile(licensePath, licenseKey.trim(), "utf-8");

    return status;
  }

  async verifyLicenseKey(licenseKey: string): Promise<LicenseStatus> {
    const currentMachineId = getMachineId();
    const enabled = isLicenseEnabled();

    if (!enabled) {
      return {
        authorized: true,
        enabled,
        machineId: currentMachineId,
        reason: "授权机制未启用。"
      };
    }

    try {
      const { payloadText, payload, signature } = parseLicenseKey(licenseKey);

      const validSignature = verifySignature(payloadText, signature);

      if (!validSignature) {
        return {
          authorized: false,
          enabled,
          machineId: currentMachineId,
          reason: "授权码签名无效。"
        };
      }

      if (payload.machineId !== currentMachineId) {
        return {
          authorized: false,
          enabled,
          machineId: currentMachineId,
          reason: "授权码不属于当前电脑。"
        };
      }

      checkLicenseTime(payload);

      const licenseHash = getLicenseHash(licenseKey);
      const state = await readLicenseState();

      if (state) {
        checkClockRollback(state.lastSeenAt);
      }

      const nowIso = new Date().toISOString();

      await saveLicenseState({
        machineId: currentMachineId,
        licenseHash,
        firstSeenAt: state?.firstSeenAt ?? nowIso,
        lastSeenAt: nowIso
      });

      return {
        authorized: true,
        enabled,
        machineId: currentMachineId,
        license: payload
      };
    } catch (error) {
      return {
        authorized: false,
        enabled,
        machineId: currentMachineId,
        reason: error instanceof Error ? error.message : "授权校验失败。"
      };
    }
  }
}
```

---

## 13. 授权脚本

新增：

```text
scripts/generate_license.ts
```

```ts
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

type LicensePayload = {
  licenseId: string;
  machineId: string;
  customer: string;
  issuedAt: string;
  expiresAt: string;
  durationDays?: number;
  features: string[];
};

function base64UrlEncode(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf-8");

  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signPayload(payloadText: string, privateKey: string): Buffer {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(payloadText);
  signer.end();

  return signer.sign(privateKey);
}

function resolveExpiresAt(input: string): {
  expiresAt: string;
  durationDays?: number;
} {
  const maybeDays = Number(input);

  if (Number.isFinite(maybeDays) && maybeDays > 0) {
    const now = Date.now();
    const expiresTime = now + maybeDays * 24 * 60 * 60 * 1000;

    return {
      expiresAt: new Date(expiresTime).toISOString(),
      durationDays: maybeDays
    };
  }

  const parsedTime = new Date(input).getTime();

  if (Number.isNaN(parsedTime)) {
    throw new Error("过期时间参数无效。请传入有效天数，例如 7、15、30，或者 ISO 时间字符串。");
  }

  return {
    expiresAt: new Date(parsedTime).toISOString()
  };
}

function main() {
  const machineId = process.argv[2];
  const customer = process.argv[3] || "unknown";
  const expiresInput = process.argv[4];

  if (!machineId || !expiresInput) {
    console.error("用法：");
    console.error("npx tsx scripts/generate_license.ts <machineId> <customer> <days|expiresAt>");
    console.error("");
    console.error("示例：");
    console.error("npx tsx scripts/generate_license.ts abc123 张三 7");
    console.error("npx tsx scripts/generate_license.ts abc123 张三 15");
    console.error("npx tsx scripts/generate_license.ts abc123 张三 30");
    console.error("npx tsx scripts/generate_license.ts abc123 张三 2026-12-31T23:59:59.000Z");
    process.exit(1);
  }

  const privateKeyPath = path.resolve("scripts/keys/private-key.pem");
  const privateKey = readFileSync(privateKeyPath, "utf-8");

  const issuedAt = new Date().toISOString();
  const { expiresAt, durationDays } = resolveExpiresAt(expiresInput);

  const payload: LicensePayload = {
    licenseId: `lic_${Date.now()}`,
    machineId,
    customer,
    issuedAt,
    expiresAt,
    durationDays,
    features: ["video-to-post", "word-export"]
  };

  const payloadText = JSON.stringify(payload);
  const signature = signPayload(payloadText, privateKey);

  const licenseKey = `${base64UrlEncode(payloadText)}.${base64UrlEncode(signature)}`;

  console.log("");
  console.log("授权信息：");
  console.log(JSON.stringify(payload, null, 2));
  console.log("");
  console.log("授权码：");
  console.log(licenseKey);
}

main();
```

运行示例：

```bash
npx tsx scripts/generate_license.ts 8f4a2c1d9cxxxx 张三 7
npx tsx scripts/generate_license.ts 8f4a2c1d9cxxxx 张三 15
npx tsx scripts/generate_license.ts 8f4a2c1d9cxxxx 张三 30
npx tsx scripts/generate_license.ts 8f4a2c1d9cxxxx 张三 365
```

---

## 14. package.json

安装：

```bash
npm install -D tsx
```

可增加脚本：

```json
{
  "scripts": {
    "license:generate": "tsx scripts/generate_license.ts"
  }
}
```

使用：

```bash
npm run license:generate -- 用户机器码 用户名 30
```

---

## 15. IPC 接口

修改：

```text
src/main/ipc.ts
```

新增：

```ts
import { LicenseService } from "./services/license.service";

const licenseService = new LicenseService();

ipcMain.handle("license:get-machine-id", async () => {
  return licenseService.getMachineId();
});

ipcMain.handle("license:check", async () => {
  return licenseService.checkLocalLicense();
});

ipcMain.handle("license:activate", async (_event, licenseKey: string) => {
  return licenseService.activate(licenseKey);
});
```

如果项目已有 `registerIpcHandlers()`，就把这些 handler 放进去。

---

## 16. preload 暴露

修改：

```text
src/preload/index.ts
```

在 `desktopApi` 中增加：

```ts
getMachineId: () => ipcRenderer.invoke("license:get-machine-id"),
checkLicense: () => ipcRenderer.invoke("license:check"),
activateLicense: (licenseKey: string) => ipcRenderer.invoke("license:activate", licenseKey),
```

---

## 17. renderer API 封装

修改：

```text
src/renderer/src/api/desktop-api.ts
```

增加：

```ts
getMachineId: (): Promise<string> => window.desktopApi.getMachineId(),
checkLicense: (): Promise<LicenseStatus> => window.desktopApi.checkLicense(),
activateLicense: (licenseKey: string): Promise<LicenseStatus> =>
  window.desktopApi.activateLicense(licenseKey),
```

---

## 18. 授权页组件

新增：

```text
src/renderer/src/components/LicenseGate.vue
```

核心功能：

```text
1. 启动时调用 checkLicense
2. 如果 authorized=true，emit("authorized")
3. 如果 authorized=false，显示授权页
4. 页面显示 machineId
5. 页面显示 reason
6. 用户粘贴授权码
7. 点击按钮调用 activateLicense
8. 成功后 emit("authorized")
9. 授权过期时按钮显示“更新授权”
```

示例代码：

```vue
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

async function activate() {
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

async function copyMachineId() {
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
          <textarea readonly :value="machineId" rows="3" />
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
```

---

## 19. App.vue 控制入口

修改：

```text
src/renderer/src/App.vue
```

示例：

```vue
<script setup lang="ts">
import { ref } from "vue";
import AppTitleBar from "./components/AppTitleBar.vue";
import LicenseGate from "./components/LicenseGate.vue";

const authorized = ref(false);
</script>

<template>
  <div class="app-shell">
    <AppTitleBar />

    <main class="app-main">
      <LicenseGate
        v-if="!authorized"
        @authorized="authorized = true"
      />

      <router-view v-else />
    </main>
  </div>
</template>
```

---

## 20. 重新授权逻辑

授权过期后，仍然显示授权页。

用户获取新的授权码后，直接粘贴到授权页。

后端 `activate()` 成功后：

```text
1. 覆盖旧 license.key
2. 更新 license-state.json
3. 返回 authorized=true
4. 前端进入系统
```

不需要单独写 `renew` 接口。

```text
重新授权 = activateLicense 覆盖旧授权码
```

---

## 21. 时间校验和防时间回拨

必须校验：

```text
1. 当前时间不能晚于 expiresAt
2. 当前时间不能早于 issuedAt
3. 当前时间不能小于 lastSeenAt - 10分钟
```

如果系统时间异常，提示：

```text
检测到系统时间被回调，请恢复正确时间后重新启动软件。
```

注意：纯本地授权无法 100% 防破解，但这个方案可以挡住普通用户改系统时间。

---

## 22. 验收标准

```text
1. LICENSE_ENABLED=false 时，启动软件直接进入工具箱。
2. LICENSE_ENABLED=true 且没有授权码时，启动显示授权页。
3. 授权页展示当前 machineId。
4. 授权页可以复制 machineId。
5. 管理员可以运行授权脚本生成授权码。
6. 授权脚本支持填写 7、15、30、365 等天数。
7. 输入错误授权码时提示授权码无效。
8. 输入其他电脑授权码时提示不属于当前电脑。
9. 输入过期授权码时提示授权码已过期。
10. 输入正确授权码后进入系统。
11. 关闭软件重新打开后自动进入系统。
12. 授权过期后重新显示授权页。
13. 用户输入新的授权码后可以重新授权。
14. 用户把系统时间往回调时，提示系统时间异常。
15. private-key.pem 不出现在打包产物中。
```

---

## 23. 给 Codex 的开发指令

请基于当前 Electron + Vue3 + TypeScript 项目开发本地授权功能。

核心要求：

```text
1. 使用私钥签名、公钥验签方案。
2. 软件内置公钥，不内置私钥。
3. 根据本机 MAC 地址生成 machineId。
4. 软件启动后先检查授权。
5. 未授权、授权无效、授权过期时显示 LicenseGate。
6. 授权成功后进入 router-view。
7. 授权码包含 machineId、issuedAt、expiresAt、durationDays。
8. 必须校验授权码签名。
9. 必须校验 machineId。
10. 必须校验 expiresAt。
11. 必须校验 issuedAt。
12. 必须保存 lastSeenAt 防止用户回调系统时间。
13. 授权过期后允许用户重新输入新授权码。
14. 重新授权复用 activateLicense，成功后覆盖旧 license.key。
15. 增加 env 开关 LICENSE_ENABLED。
16. LICENSE_ENABLED=false 时直接跳过授权。
17. LICENSE_ENABLED=true 时启用授权页。
18. 新增 generate_license.ts 脚本。
19. generate_license.ts 第三个参数支持数字天数，例如 7、15、30。
20. 也兼容 ISO 过期时间字符串。
```

新增文件：

```text
src/main/services/machine.service.ts
src/main/services/license.service.ts
src/renderer/src/components/LicenseGate.vue
scripts/generate_license.ts
src/main/license/public-key.pem
```

修改文件：

```text
src/main/types/app.types.ts
src/main/ipc.ts
src/preload/index.ts
src/renderer/src/api/desktop-api.ts
src/renderer/src/App.vue
.gitignore
package.json
.env
.env.production
```

最终效果：

```text
开发版：
LICENSE_ENABLED=false
软件直接进入系统

正式版：
LICENSE_ENABLED=true
未授权先显示授权页
激活成功后进入系统
过期后重新显示授权页
输入新授权码后重新进入系统
```
