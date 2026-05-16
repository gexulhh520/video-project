import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { LicensePayload, LicenseStatus } from "../types/app.types";
import { getMachineId, isFingerprintMismatch } from "./machine.service";
import publicKeyPem from "../license/public-key.pem?raw";

const CLOCK_ROLLBACK_TOLERANCE_MS = 10 * 60 * 1000;

type LicenseRuntimeState = {
  machineId: string;
  licenseHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

// 这里手动开启授权功能
function isLicenseEnabled(): boolean {
  // return process.env.LICENSE_ENABLED === "true";
  return true;
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

  return { payloadText, payload, signature };
}

function verifySignature(payloadText: string, signature: Buffer): boolean {
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(payloadText);
  verifier.end();

  return verifier.verify(publicKeyPem, signature);
}

function parseTime(value?: string): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
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

    if (isFingerprintMismatch()) {
      return {
        authorized: false,
        enabled,
        machineId,
        reason: "检测到授权文件与当前设备硬件不匹配，请重新激活。"
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