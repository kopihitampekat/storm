import { execSync } from "child_process";
import type {
  IProvider,
  WorkerInfo,
  DeployOptions,
  InvokeOptions,
  InvokeResult,
  CloudflareAccountConfig,
} from "../core/types.js";

export class CloudflareProvider implements IProvider {
  readonly name = "cloudflare";
  private accountId: string;
  private apiToken: string;
  private apiBase = "https://api.cloudflare.com/client/v4";

  constructor(config: CloudflareAccountConfig) {
    this.accountId = config.account_id;
    this.apiToken = config.api_token;
  }

  private async cfApi(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    const url = `${this.apiBase}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as {
      success: boolean;
      result: unknown;
      errors: Array<{ message: string }>;
    };
    if (!json.success) {
      const msg = json.errors?.map((e) => e.message).join(", ") ?? "Unknown CF API error";
      throw new Error(`Cloudflare API: ${msg}`);
    }
    return json.result;
  }

  async deploy(opts: DeployOptions): Promise<WorkerInfo> {
    const script =
      opts.workerScript ?? this.getDefaultWorkerPath();

    try {
      execSync(
        `wrangler deploy ${script} --name ${opts.name} --compatibility-date 2024-01-01`,
        {
          env: {
            ...process.env,
            CLOUDFLARE_API_TOKEN: this.apiToken,
            CLOUDFLARE_ACCOUNT_ID: this.accountId,
          },
          stdio: "pipe",
        },
      );
    } catch (err) {
      throw new Error(
        `Failed to deploy worker '${opts.name}': ${err}`,
      );
    }

    return {
      name: opts.name,
      provider: this.name,
      url: `https://${opts.name}.${this.accountId}.workers.dev`,
      region: opts.region ?? "global",
      status: "active",
      createdAt: new Date().toISOString(),
    };
  }

  async deployMany(opts: DeployOptions[]): Promise<WorkerInfo[]> {
    const results: WorkerInfo[] = [];
    for (const opt of opts) {
      results.push(await this.deploy(opt));
    }
    return results;
  }

  async remove(name: string): Promise<void> {
    await this.cfApi(
      `/accounts/${this.accountId}/workers/scripts/${name}`,
      "DELETE",
    );
  }

  async removeMany(names: string[]): Promise<void> {
    await Promise.all(names.map((n) => this.remove(n)));
  }

  async list(prefix?: string): Promise<WorkerInfo[]> {
    const result = (await this.cfApi(
      `/accounts/${this.accountId}/workers/scripts`,
    )) as Array<{ id: string; created_on: string; modified_on: string }>;

    let workers = result.map((w) => ({
      name: w.id,
      provider: this.name,
      url: `https://${w.id}.${this.accountId}.workers.dev`,
      status: "active" as const,
      createdAt: w.created_on,
    }));

    if (prefix) {
      workers = workers.filter((w) => w.name.startsWith(prefix));
    }

    return workers;
  }

  async info(name: string): Promise<WorkerInfo> {
    const workers = await this.list();
    const worker = workers.find((w) => w.name === name);
    if (!worker) throw new Error(`Worker '${name}' not found`);
    return worker;
  }

  async invoke(
    worker: WorkerInfo,
    payload: unknown,
    opts?: InvokeOptions,
  ): Promise<InvokeResult> {
    const method = opts?.method ?? "POST";
    const timeout = opts?.timeout ?? 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const start = Date.now();

    try {
      const url =
        method === "GET" && !payload
          ? `${worker.url}/health`
          : `${worker.url}/scan`;

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...opts?.headers,
        },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      });

      const duration = Date.now() - start;
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }

      return {
        workerName: worker.name,
        statusCode: res.status,
        body,
        duration,
      };
    } catch (err) {
      return {
        workerName: worker.name,
        statusCode: 0,
        body: null,
        duration: Date.now() - start,
        error: String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async *logs(name: string): AsyncGenerator<string> {
    // CF Workers logs require wrangler tail
    const { spawn } = await import("child_process");
    const proc = spawn("wrangler", ["tail", name, "--format", "json"], {
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: this.apiToken,
        CLOUDFLARE_ACCOUNT_ID: this.accountId,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    for await (const chunk of proc.stdout) {
      yield chunk.toString();
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.cfApi("/user/tokens/verify");
      return true;
    } catch {
      return false;
    }
  }

  private getDefaultWorkerPath(): string {
    return "dist/workers/cloudflare.js";
  }
}
