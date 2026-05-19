import type { OpenCliProfileStatus } from "../../types/app.types";

export type OpenCliChatMessage = {
  Index?: number;
  Role?: string;
  Text?: string;
};

const INVALID_PROFILE_IDS = new Set([
  "extension",
  "extensions",
  "browser",
  "profile",
  "profiles",
  "context",
  "connected",
  "disconnected",
  "unknown",
  "status",
  "daemon",
  "chrome",
  "bridge",
  "default"
]);

export function isLikelyOpenCliProfileId(value: string): boolean {
  const id = value.trim();
  if (!id) return false;
  if (INVALID_PROFILE_IDS.has(id.toLowerCase())) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(id)) return false;
  return true;
}

export function parseOpenCliProfiles(output: string): OpenCliProfileStatus[] {
  const lines = output.split(/\r?\n/);
  const profilesFromSection = parseProfilesSection(lines);
  if (profilesFromSection.length > 0) {
    return profilesFromSection;
  }

  return parseProfilesFallback(lines);
}

export function getFirstConnectedProfile(output: string): string | undefined {
  return parseOpenCliProfiles(output).find((item) => item.status === "connected")?.id;
}

export function parseOpenCliJson<T = unknown>(output: string): T {
  const text = output; // sanitizeJsonText commented out
  // const firstObject = extractFirstCompleteJsonObject(text);
  const candidates = [text, /* firstObject, */ ...extractJsonCandidates(text)].filter(
    (candidate): candidate is string => Boolean(candidate && candidate.trim())
  );

  for (const candidate of candidates) {
    try {
      return parseJsonMaybeString<T>(candidate);
    } catch {
      // Continue trying more candidates.
    }
  }

  throw new Error("OpenCLI output is not valid JSON.");
}

export function repairWebLlmJsonText(text: string): string {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    .replace(/\\_/g, "_")
    .trim();
}

export function parseOpenCliModelJson<T = unknown>(output: string): T {
  const text = sanitizeModelJsonText(output);
  const codeBlockText = extractCodeBlockJsonText(text);
  // const firstObject = extractFirstCompleteJsonObject(text);
  const candidates = [text, codeBlockText, /* firstObject, */ ...extractJsonCandidates(text)].filter(
    (candidate): candidate is string => Boolean(candidate && candidate.trim())
  );

  for (const candidate of candidates) {
    try {
      return parseJsonMaybeString<T>(candidate);
    } catch {
      // Continue trying more candidates.
    }
  }

  throw new Error("OpenCLI model output is not valid JSON.");
}

export function parseOpenCliMessages(payload: unknown): OpenCliChatMessage[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is OpenCliChatMessage => typeof item === "object" && item !== null);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.messages)) {
    return record.messages.filter((item): item is OpenCliChatMessage => typeof item === "object" && item !== null);
  }

  if (Array.isArray(record.data)) {
    return record.data.filter((item): item is OpenCliChatMessage => typeof item === "object" && item !== null);
  }

  return [];
}

export function getLastAssistantText(messages: OpenCliChatMessage[]): string | null {
  const assistantMessages = messages.filter((item) => {
    const role = String(item.Role || "").toLowerCase();
    return role === "assistant";
  });

  if (!assistantMessages.length) {
    return null;
  }

  const text = String(assistantMessages.at(-1)?.Text || "").trim();
  if (!text) {
    return null;
  }

  const pendingWords = ["Thinking", "正在思考", "思考中", "生成中", "正在生成"];
  if (pendingWords.some((word) => text.includes(word))) {
    return null;
  }

  return text;
}

function sanitizeJsonText(output: string): string {
  const trimmed = String(output || "").trim();
  if (!trimmed) return "";

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  return trimmed;
}

function sanitizeModelJsonText(output: string): string {
  // const repaired = repairWebLlmJsonText(output);
  // return repaired;
  return output;
}

function parseJsonMaybeString<T = unknown>(candidate: string): T {
  const first = JSON.parse(candidate);

  if (typeof first === "string") {
    return JSON.parse(first) as T; // repairWebLlmJsonText commented out
  }

  return first as T;
}

function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(text.slice(arrayStart, arrayEnd + 1));
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1));
  }

  return candidates;
}

function extractCodeBlockJsonText(text: string): string | null {
  const codeBlockMatch = String(text || "").match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (!codeBlockMatch?.[1]) {
    return null;
  }
  // const repaired = repairWebLlmJsonText(codeBlockMatch[1]);
  // return repaired || null;
  return codeBlockMatch[1] || null;
}

function extractFirstCompleteJsonObject(text: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseProfilesSection(lines: string[]): OpenCliProfileStatus[] {
  const startIndex = lines.findIndex((line) => /^\s*Profiles:\s*$/i.test(line));
  if (startIndex < 0) {
    return [];
  }

  const profiles: OpenCliProfileStatus[] = [];
  const seen = new Set<string>();

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine.trim()) {
      if (profiles.length > 0) break;
      continue;
    }

    // End the section on next diagnostic block header.
    if (/^\s*\[[A-Z]+\]/.test(rawLine)) {
      break;
    }

    const line = rawLine.trim();
    const match = line.match(
      /^(?:[-*•]\s*)?([A-Za-z0-9][A-Za-z0-9._-]{1,63})\s*:\s*(connected|disconnected|unknown)\b(?:\s+v?([\d.]+))?/i
    );
    if (!match) {
      continue;
    }

    const id = match[1].trim();
    if (!isLikelyOpenCliProfileId(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);

    profiles.push({
      id,
      status: match[2].toLowerCase() as OpenCliProfileStatus["status"],
      version: match[3]
    });
  }

  return profiles;
}

function parseProfilesFallback(lines: string[]): OpenCliProfileStatus[] {
  const profiles: OpenCliProfileStatus[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(
      /(?:^|[-*•\s])([A-Za-z0-9][A-Za-z0-9._-]{1,63})\s*:\s*(connected|disconnected|unknown)\b(?:\s+v?([\d.]+))?/i
    );
    if (!match) continue;

    const id = match[1].trim();
    if (!isLikelyOpenCliProfileId(id) || seen.has(id)) continue;
    seen.add(id);

    profiles.push({
      id,
      status: match[2].toLowerCase() as OpenCliProfileStatus["status"],
      version: match[3]
    });
  }

  return profiles;
}
