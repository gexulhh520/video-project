import { spawn } from "node:child_process";
import type { BrowserRuntimeHealthStatus } from "../types/app.types";
import { SettingsService } from "./settings.service";

type CommandResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

const NOT_READY_PATTERNS = [
  "Daemon not running",
  "Daemon running: no",
  "No daemon.json found",
  "Is the daemon running",
  "CDP connected:  no",
  "CDP connected: no",
  "Chrome not connected",
  "CDP WebSocket closed",
  "CDP WebSocket closed unexpectedly",
  "Daemon HTTP 503",
  "ECONNREFUSED"
];

export class BrowserRuntimeService {
  constructor(private readonly settingsService: SettingsService) {}

  async checkHealth(): Promise<BrowserRuntimeHealthStatus> {
    const output = await this.runBbBrowserCommand(["status"], 10000);
    const merged = `${output.stdout}\n${output.stderr}`.trim();
    const daemonRunning = /Daemon running:\s+yes/i.test(merged);
    const cdpConnected = /CDP connected:\s+yes/i.test(merged);
    const hasNotReadyPattern = NOT_READY_PATTERNS.some((pattern) => merged.includes(pattern));
    const healthy = output.code === 0 && daemonRunning && cdpConnected && !hasNotReadyPattern;

    return {
      healthy,
      daemonRunning,
      cdpConnected,
      checkedAt: new Date().toISOString(),
      message: healthy ? "bb-browser 运行时健康" : "bb-browser 运行时未就绪",
      rawOutput: merged
    };
  }

  async resetRuntime(): Promise<void> {
    await this.runBbBrowserCommand(["daemon", "shutdown"], 10000, true);
    await this.runBbBrowserCommand(["open", "about:blank"], 30000);
  }

  async ensureHealthy(): Promise<BrowserRuntimeHealthStatus> {
    const firstCheck = await this.checkHealth();
    if (firstCheck.healthy) {
      return firstCheck;
    }

    await this.resetRuntime();
    const secondCheck = await this.checkHealth();
    if (!secondCheck.healthy) {
      throw new Error(secondCheck.rawOutput || "bb-browser runtime is still unhealthy after reset.");
    }

    return secondCheck;
  }

  private async runCommand(command: string, args: string[], timeoutMs: number, ignoreError = false): Promise<CommandResult> {
    return new Promise<CommandResult>((resolvePromise, rejectPromise) => {
      const normalized = this.buildSpawnCommand(command, args);
      const child = spawn(normalized.command, normalized.args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        if (ignoreError) {
          resolvePromise({ stdout, stderr: `${stderr}\nCommand timed out`, code: null });
          return;
        }
        rejectPromise(new Error(`Command timed out: ${command} ${args.join(" ")}`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        if (ignoreError) {
          resolvePromise({ stdout, stderr: `${stderr}\n${error.message}`, code: null });
          return;
        }
        rejectPromise(error);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !ignoreError) {
          rejectPromise(new Error(`Command failed (${code}): ${command} ${args.join(" ")}\n${stderr || stdout}`));
          return;
        }

        resolvePromise({ stdout, stderr, code });
      });
    });
  }

  private async runBbBrowserCommand(args: string[], timeoutMs: number, ignoreError = false): Promise<CommandResult> {
    const { command, prefixArgs } = await this.resolveCommandAndArgs("cli");
    return this.runCommand(command, [...prefixArgs, ...args], timeoutMs, ignoreError);
  }

  private parseArgs(value: string): string[] {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async resolveCommandAndArgs(kind: "cli" | "mcp"): Promise<{ command: string; prefixArgs: string[] }> {
    const settings = await this.settingsService.getWebToPostSettings();
    const command = this.normalizeExecutable(kind === "cli" ? settings.bbBrowserCommand.trim() : settings.bbBrowserMcpCommand.trim());
    const rawArgs = kind === "cli" ? settings.bbBrowserArgs : settings.bbBrowserMcpArgs;
    const prefixArgs = this.parseArgs(rawArgs);

    if (command.toLowerCase() === "bb-browser" && prefixArgs.includes("-p") && prefixArgs.includes("bb-browser")) {
      return {
        command: this.normalizeExecutable("npx"),
        prefixArgs
      };
    }

    return {
      command,
      prefixArgs
    };
  }

  private normalizeExecutable(command: string): string {
    if (process.platform === "win32") {
      if (command.toLowerCase() === "npx") {
        return "npx.cmd";
      }

      if (command.toLowerCase() === "npm") {
        return "npm.cmd";
      }
    }

    return command;
  }

  private buildSpawnCommand(command: string, args: string[]): { command: string; args: string[] } {
    if (process.platform === "win32" && this.requiresCmdWrapper(command)) {
      const commandLine = [command, ...args].map((item) => this.quoteForCmd(item)).join(" ");
      return {
        command: "cmd.exe",
        args: ["/d", "/s", "/c", commandLine]
      };
    }

    return {
      command,
      args
    };
  }

  private requiresCmdWrapper(command: string): boolean {
    const lower = command.toLowerCase();
    return lower.endsWith(".cmd") || lower === "npx" || lower === "npm";
  }

  private quoteForCmd(value: string): string {
    if (!/[\s"&^|<>]/.test(value)) {
      return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
  }
}
