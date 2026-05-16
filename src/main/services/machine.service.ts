import crypto from "node:crypto";
import { execSync } from "node:child_process";
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

function getFingerprintSnapshotPath(): string {
  return path.join(getLicenseDirPath(), "device-fingerprint.json");
}

function getFingerprintHealthPath(): string {
  return path.join(getLicenseDirPath(), "device-fingerprint-health.json");
}

function isValidMachineId(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.trim());
}

type HardwareSignals = {
  machineGuid: string;
  boardSerial: string;
  biosSerial: string;
  cpuId: string;
  primaryMac: string;
  hostname: string;
};

type FingerprintSnapshot = {
  machineId: string;
  createdAt: string;
  signals: HardwareSignals;
};

type FingerprintHealthState = {
  status: "ok" | "mismatch";
  lastCheckedAt: string;
  score?: number;
};

const BACKGROUND_RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let backgroundVerifyRunning = false;

function isDevLoggingEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

function maskSignal(value: string): string {
  if (!value) return "(empty)";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function logFingerprintDebug(title: string, payload: Record<string, unknown>): void {
  if (!isDevLoggingEnabled()) return;
  console.log(`[license-debug] ${title}`, payload);
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

function readSnapshot(): FingerprintSnapshot | null {
  const filePath = getFingerprintSnapshotPath();
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as FingerprintSnapshot;
    if (!parsed?.machineId || !parsed?.signals) return null;
    if (!isValidMachineId(parsed.machineId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readHealthState(): FingerprintHealthState | null {
  const filePath = getFingerprintHealthPath();
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as FingerprintHealthState;
    if (!parsed?.status || !parsed?.lastCheckedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistSnapshot(snapshot: FingerprintSnapshot): void {
  try {
    const filePath = getFingerprintSnapshotPath();
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  } catch {
    // ignore write failures and continue using in-memory values
  }
}

function persistHealthState(state: FingerprintHealthState): void {
  try {
    const filePath = getFingerprintHealthPath();
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // ignore write failures and continue runtime
  }
}

function normalizeSignal(value: string): string {
  return value.trim().toLowerCase();
}

function runWindowsSignalCommand(command: string): string {
  try {
    const output = execSync(command, {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
      encoding: "utf-8"
    });

    const cleaned = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !!line && line !== "SerialNumber" && line !== "ProcessorId")
      .join(" ");

    return normalizeSignal(cleaned);
  } catch {
    return "";
  }
}

function getWindowsHardwareSignals(): Partial<HardwareSignals> {
  const machineGuid = runWindowsSignalCommand(
    "powershell -NoProfile -Command \"(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid\""
  );
  const boardSerial = runWindowsSignalCommand(
    "powershell -NoProfile -Command \"(Get-CimInstance Win32_BaseBoard).SerialNumber\""
  );
  const biosSerial = runWindowsSignalCommand(
    "powershell -NoProfile -Command \"(Get-CimInstance Win32_BIOS).SerialNumber\""
  );
  const cpuId = runWindowsSignalCommand(
    "powershell -NoProfile -Command \"(Get-CimInstance Win32_Processor).ProcessorId\""
  );

  return {
    machineGuid,
    boardSerial,
    biosSerial,
    cpuId
  };
}

function collectHardwareSignals(): HardwareSignals {
  const winSignals = process.platform === "win32" ? getWindowsHardwareSignals() : {};
  const mac = getPrimaryMacAddress();

  return {
    machineGuid: normalizeSignal(winSignals.machineGuid ?? ""),
    boardSerial: normalizeSignal(winSignals.boardSerial ?? ""),
    biosSerial: normalizeSignal(winSignals.biosSerial ?? ""),
    cpuId: normalizeSignal(winSignals.cpuId ?? ""),
    primaryMac: normalizeSignal(mac),
    hostname: normalizeSignal(os.hostname())
  };
}

function buildMachineIdFromSignals(signals: HardwareSignals): string {
  const strongParts = [
    signals.machineGuid,
    signals.boardSerial,
    signals.biosSerial,
    signals.cpuId
  ].filter(Boolean);

  const fallbackParts = [signals.primaryMac, signals.hostname].filter(Boolean);
  const source = [...strongParts, ...fallbackParts].join("|");
  if (!source) {
    throw new Error("无法生成机器码：未采集到有效硬件信息。");
  }

  return crypto.createHash("sha256").update(`video-project:${source}`).digest("hex");
}

function matchScore(a: HardwareSignals, b: HardwareSignals): number {
  const weights: Array<[keyof HardwareSignals, number]> = [
    ["machineGuid", 4],
    ["boardSerial", 3],
    ["biosSerial", 3],
    ["cpuId", 3],
    ["primaryMac", 1],
    ["hostname", 1]
  ];

  let score = 0;
  for (const [field, weight] of weights) {
    const av = a[field];
    const bv = b[field];
    if (!av || !bv) continue;
    if (av === bv) score += weight;
  }

  return score;
}

function getMatchedFields(a: HardwareSignals, b: HardwareSignals): Array<keyof HardwareSignals> {
  const fields: Array<keyof HardwareSignals> = [
    "machineGuid",
    "boardSerial",
    "biosSerial",
    "cpuId",
    "primaryMac",
    "hostname"
  ];

  return fields.filter((field) => {
    const av = a[field];
    const bv = b[field];
    return !!av && !!bv && av === bv;
  });
}

function maybeScheduleBackgroundVerification(snapshot: FingerprintSnapshot): void {
  if (backgroundVerifyRunning) return;

  const health = readHealthState();
  const lastCheckedAt = health ? new Date(health.lastCheckedAt).getTime() : 0;
  const now = Date.now();
  if (Number.isFinite(lastCheckedAt) && now - lastCheckedAt < BACKGROUND_RECHECK_INTERVAL_MS) {
    return;
  }

  backgroundVerifyRunning = true;
  setTimeout(() => {
    try {
      const currentSignals = collectHardwareSignals();
      const score = matchScore(snapshot.signals, currentSignals);
      const threshold = 8;
      const matchedFields = getMatchedFields(snapshot.signals, currentSignals);

      persistHealthState({
        status: score >= threshold ? "ok" : "mismatch",
        lastCheckedAt: new Date().toISOString(),
        score
      });

      logFingerprintDebug("background-snapshot-compare", {
        snapshotMachineId: maskSignal(snapshot.machineId),
        score,
        threshold,
        matchedFields,
        status: score >= threshold ? "ok" : "mismatch"
      });
    } catch (error) {
      logFingerprintDebug("background-snapshot-compare-error", {
        error: error instanceof Error ? error.message : "unknown"
      });
    } finally {
      backgroundVerifyRunning = false;
    }
  }, 0);
}

export function isFingerprintMismatch(): boolean {
  const state = readHealthState();
  return state?.status === "mismatch";
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
  // Fast path: avoid expensive hardware probing on every startup.
  // If machine id and snapshot both exist, trust persisted id for runtime speed.
  const persisted = readPersistedMachineId();
  const existingSnapshot = readSnapshot();
  if (persisted && existingSnapshot && existingSnapshot.machineId === persisted) {
    maybeScheduleBackgroundVerification(existingSnapshot);
    logFingerprintDebug("machine-id-decision", {
      decision: "fast_path_use_persisted_machine_id",
      machineId: maskSignal(persisted)
    });
    return persisted;
  }

  const currentSignals = collectHardwareSignals();
  const currentComputedMachineId = buildMachineIdFromSignals(currentSignals);

  logFingerprintDebug("current-signals", {
    machineGuid: maskSignal(currentSignals.machineGuid),
    boardSerial: maskSignal(currentSignals.boardSerial),
    biosSerial: maskSignal(currentSignals.biosSerial),
    cpuId: maskSignal(currentSignals.cpuId),
    primaryMac: maskSignal(currentSignals.primaryMac),
    hostname: currentSignals.hostname
  });

  const snapshot = existingSnapshot;
  if (snapshot) {
    const score = matchScore(snapshot.signals, currentSignals);
    const threshold = 8;
    const matchedFields = getMatchedFields(snapshot.signals, currentSignals);

    logFingerprintDebug("snapshot-compare", {
      snapshotMachineId: maskSignal(snapshot.machineId),
      currentComputedMachineId: maskSignal(currentComputedMachineId),
      score,
      threshold,
      matchedFields
    });

    // Tolerate small changes (e.g. network card replacement) while blocking cross-device copy.
    if (score >= threshold) {
      persistMachineId(snapshot.machineId);
      logFingerprintDebug("machine-id-decision", {
        decision: "reuse_snapshot_machine_id",
        machineId: maskSignal(snapshot.machineId)
      });
      return snapshot.machineId;
    }
  }

  const machineId = currentComputedMachineId;
  persistMachineId(machineId);
  persistSnapshot({
    machineId,
    createdAt: new Date().toISOString(),
    signals: currentSignals
  });
  persistHealthState({
    status: "ok",
    lastCheckedAt: new Date().toISOString()
  });
  logFingerprintDebug("machine-id-decision", {
    decision: "use_current_computed_machine_id",
    machineId: maskSignal(machineId)
  });
  return machineId;
}
