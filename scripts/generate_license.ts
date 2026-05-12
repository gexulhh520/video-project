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

function resolveExpiresAt(input: string): { expiresAt: string; durationDays?: number } {
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

function main(): void {
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
