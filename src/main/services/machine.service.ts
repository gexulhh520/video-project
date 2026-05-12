import crypto from "node:crypto";
import os from "node:os";

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
  const mac = getPrimaryMacAddress();

  return crypto.createHash("sha256").update(`video-project:${mac}`).digest("hex");
}
