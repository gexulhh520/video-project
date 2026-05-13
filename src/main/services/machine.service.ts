import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

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

function getLicenseDirPath(): string {
  return path.join(app.getPath("userData"), "license");
}

function getMachineIdPath(): string {
  return path.join(getLicenseDirPath(), "machine-id.txt");
}

function getLicenseKeyPath(): string {
  return path.join(getLicenseDirPath(), "license.key");
}

function isValidMachineId(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.trim());
}

function readPersistedMachineId(): string | null {
  const machineIdPath = getMachineIdPath();
  if (!existsSync(machineIdPath)) return null;

  const machineId = readFileSync(machineIdPath, "utf-8").trim();
  return isValidMachineId(machineId) ? machineId : null;
}

function persistMachineId(machineId: string): void {
  const machineIdPath = getMachineIdPath();
  mkdirSync(path.dirname(machineIdPath), { recursive: true });
  writeFileSync(machineIdPath, machineId, "utf-8");
}

function decodeBase64Url(value: string): string {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) {
    normalized += "=";
  }
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function recoverMachineIdFromExistingLicense(): string | null {
  const licenseKeyPath = getLicenseKeyPath();
  if (!existsSync(licenseKeyPath)) return null;

  try {
    const licenseKey = readFileSync(licenseKeyPath, "utf-8").trim();
    const [payloadPart] = licenseKey.split(".");
    if (!payloadPart) return null;

    const payloadText = decodeBase64Url(payloadPart);
    const payload = JSON.parse(payloadText) as { machineId?: string };
    const machineId = payload.machineId?.trim();

    return machineId && isValidMachineId(machineId) ? machineId : null;
  } catch {
    return null;
  }
}

export function getPrimaryMacAddress(): string {
  const interfaces = os.networkInterfaces();
  const candidates: Array<{ name: string; mac: string }> = [];

  for (const [name, list] of Object.entries(interfaces)) {
    if (!list || isLikelyVirtualInterface(name)) continue;

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
  const persisted = readPersistedMachineId();
  if (persisted) {
    return persisted;
  }

  // Backward-compatible migration: keep historical authorized machine id if license already exists.
  const recovered = recoverMachineIdFromExistingLicense();
  if (recovered) {
    persistMachineId(recovered);
    return recovered;
  }

  const mac = getPrimaryMacAddress();
  const generated = crypto.createHash("sha256").update(`video-project:${mac}`).digest("hex");
  persistMachineId(generated);
  return generated;
}
