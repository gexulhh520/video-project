import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type OpenCliCommandResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export type RunOpenCliOptions = {
  timeoutMs?: number;
  ignoreError?: boolean;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
};

const STDERR_NOISE_PATTERNS = [
  /Extension update available/i,
  /Run opencli upgrade/i
];

const POWERSHELL_CMD_BRIDGE = [
  "$ErrorActionPreference = 'Stop'",
  "$command = $env:OPENCLI_RUNNER_COMMAND",
  "$argsPath = $env:OPENCLI_RUNNER_ARGS_FILE",
  "$argFilePrefix = '__OPENCLI_ARG_FILE__:'",
  "$argList = @()",
  "$lines = [System.IO.File]::ReadAllLines($argsPath)",
  "foreach ($line in $lines) {",
  "  if (-not [string]::IsNullOrWhiteSpace($line)) {",
    "    $bytes = [System.Convert]::FromBase64String($line)",
  "    $arg = [System.Text.Encoding]::UTF8.GetString($bytes)",
  "    if ($arg.StartsWith($argFilePrefix)) {",
  "      $argPath = $arg.Substring($argFilePrefix.Length)",
  "      $arg = [System.IO.File]::ReadAllText($argPath, [System.Text.Encoding]::UTF8)",
  "    }",
  "    $argList += $arg",
  "  }",
  "}",
  "& $command @argList",
  "exit $LASTEXITCODE"
].join("; ");

type SpawnCommand = {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  cleanup?: () => void;
};

export class OpenCliCommandRunner {
  constructor(private readonly openCliCommand = "opencli") {}

  async run(args: string[], options: RunOpenCliOptions = {}): Promise<OpenCliCommandResult> {
    const timeoutMs = options.timeoutMs ?? 60000;
    const ignoreError = options.ignoreError ?? false;

    return new Promise((resolvePromise, rejectPromise) => {
      const normalizedCommand = this.normalizeExecutable(this.openCliCommand);
      const spawnArgs = this.buildSpawnCommand(normalizedCommand, args);
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        spawnArgs.cleanup?.();
      };
      const child = spawn(spawnArgs.command, spawnArgs.args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        cwd: options.cwd || process.cwd(),
        env: {
          ...process.env,
          ...options.env,
          ...spawnArgs.env
        }
      });

      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        child.kill();
        if (ignoreError) {
          resolvePromise({
            stdout,
            stderr: `${stderr}\nCommand timed out`,
            code: null
          });
          return;
        }

        rejectPromise(new Error(`OpenCLI command timed out: ${this.openCliCommand} ${args.join(" ")}`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        cleanup();
        if (ignoreError) {
          resolvePromise({
            stdout,
            stderr: `${stderr}\n${error.message}`,
            code: null
          });
          return;
        }

        rejectPromise(error);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        cleanup();
        const cleanedStderr = this.removeNoise(stderr);

        if (code !== 0 && !ignoreError) {
          rejectPromise(
            new Error(
              `OpenCLI command failed (${code}): ${this.openCliCommand} ${args.join(" ")}\n${cleanedStderr || stdout}`
            )
          );
          return;
        }

        resolvePromise({
          stdout,
          stderr: cleanedStderr,
          code
        });
      });
    });
  }

  private normalizeExecutable(command: string): string {
    if (process.platform === "win32" && command.toLowerCase() === "opencli") {
      return "opencli.cmd";
    }

    return command;
  }

  private buildSpawnCommand(command: string, args: string[]): SpawnCommand {
    if (process.platform === "win32" && this.requiresCmdWrapper(command)) {
      const tempDir = mkdtempSync(join(tmpdir(), "opencli-runner-"));
      const argsPath = join(tempDir, "args.txt");
      const encodedArgs = args.map((arg) => Buffer.from(arg, "utf8").toString("base64")).join("\n");
      writeFileSync(argsPath, encodedArgs, "ascii");

      return {
        command: "powershell.exe",
        args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", POWERSHELL_CMD_BRIDGE],
        env: {
          OPENCLI_RUNNER_COMMAND: command,
          OPENCLI_RUNNER_ARGS_FILE: argsPath
        },
        cleanup: () => {
          rmSync(tempDir, { recursive: true, force: true });
        }
      };
    }

    return { command, args };
  }

  private requiresCmdWrapper(command: string): boolean {
    const lower = command.toLowerCase();
    return lower.endsWith(".cmd") || lower.endsWith(".bat");
  }

  private removeNoise(stderr: string): string {
    const lines = stderr
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)
      .filter((line) => !STDERR_NOISE_PATTERNS.some((pattern) => pattern.test(line)));

    return lines.join("\n");
  }
}
