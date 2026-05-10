import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export class McpStdioClientService {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private pending = new Map<string | number, PendingRequest>();
  private initialized = false;
  private startPromise: Promise<void> | null = null;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly serverName: string
  ) {}

  async ensureStarted(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.start();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async listTools(): Promise<McpTool[]> {
    await this.ensureStarted();
    const result = await this.request("tools/list", {});
    return Array.isArray(result?.tools) ? (result.tools as McpTool[]) : [];
  }

  async callTool(name: string, argumentsObject: Record<string, unknown>): Promise<any> {
    await this.ensureStarted();
    return this.request("tools/call", {
      name,
      arguments: argumentsObject
    });
  }

  async ping(): Promise<boolean> {
    await this.ensureStarted();
    return true;
  }

  async dispose(): Promise<void> {
    this.initialized = false;
    const process = this.process;
    this.process = null;
    if (process) {
      process.kill();
    }
  }

  private async start(): Promise<void> {
    this.process = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32"
    });

    this.process.stdout.setEncoding("utf8");
    this.process.stderr.setEncoding("utf8");
    this.process.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    this.process.stderr.on("data", () => {
      // Keep stderr drained; many MCP servers log here.
    });
    this.process.on("exit", () => {
      this.initialized = false;
      this.process = null;
      const pending = [...this.pending.values()];
      this.pending.clear();
      pending.forEach((item) => item.reject(new Error(`${this.serverName} MCP process exited unexpectedly.`)));
    });
    this.process.on("error", (error) => {
      const pending = [...this.pending.values()];
      this.pending.clear();
      pending.forEach((item) => item.reject(error instanceof Error ? error : new Error(String(error))));
    });

    const initializeResult = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "video-project",
        version: "0.1.0"
      }
    });

    this.notify("notifications/initialized", {});
    this.initialized = Boolean(initializeResult);
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;

    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const headerText = this.buffer.slice(0, headerEnd);
      const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const bodyLength = Number(lengthMatch[1]);
      const totalLength = headerEnd + 4 + bodyLength;
      if (this.buffer.length < totalLength) {
        return;
      }

      const body = this.buffer.slice(headerEnd + 4, totalLength);
      this.buffer = this.buffer.slice(totalLength);

      try {
        const message = JSON.parse(body) as {
          id?: string | number;
          result?: any;
          error?: { message?: string };
          method?: string;
        };

        if (typeof message.id !== "undefined") {
          const pending = this.pending.get(message.id);
          if (pending) {
            this.pending.delete(message.id);
            if (message.error) {
              pending.reject(new Error(message.error.message || "MCP request failed."));
            } else {
              pending.resolve(message.result);
            }
          }
        }
      } catch {
        // Ignore malformed server logs interleaved on stdout.
      }
    }
  }

  private async request(method: string, params: Record<string, unknown>): Promise<any> {
    if (!this.process) {
      throw new Error(`${this.serverName} MCP process is not running.`);
    }

    const id = randomUUID();
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.writeMessage(payload);
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    if (!this.process) {
      return;
    }

    this.writeMessage({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  private writeMessage(message: unknown): void {
    if (!this.process) {
      throw new Error(`${this.serverName} MCP process is not running.`);
    }

    const json = JSON.stringify(message);
    const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
    this.process.stdin.write(payload);
  }
}
