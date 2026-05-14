import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type ExternalCommandResult = {
  stdout: string;
  stderr: string;
};

export async function tryResolvePythonToolExe(toolName: string): Promise<string | undefined> {
  const exeName = `${toolName}.exe`;

  const candidatePaths = [
    resolve(process.resourcesPath, "python", exeName),
    resolve(process.cwd(), "resources", "python", exeName)
  ];

  for (const candidatePath of candidatePaths) {
    try {
      await access(candidatePath, constants.F_OK);
      return candidatePath;
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function resolvePythonExecutablePath(): Promise<string> {
  const bundledPythonPath = join(
    homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "python",
    "python.exe"
  );

  try {
    await access(bundledPythonPath, constants.X_OK);
    return bundledPythonPath;
  } catch {
    return "python";
  }
}

export async function runExternalCommand(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): Promise<ExternalCommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
      env: env ?? process.env
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", rejectPromise);

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      rejectPromise(new Error(`${command} failed with code ${code}: ${stderr}`));
    });
  });
}

export async function runPythonTool(
  toolName: string,
  scriptFileName: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): Promise<ExternalCommandResult> {
  const exePath = await tryResolvePythonToolExe(toolName);

  if (exePath) {
    return runExternalCommand(exePath, args, env);
  }

  const pythonPath = await resolvePythonExecutablePath();
  const scriptPath = resolve(process.cwd(), "scripts", scriptFileName);

  return runExternalCommand(pythonPath, [scriptPath, ...args], env);
}
