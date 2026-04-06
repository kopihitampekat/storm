import { execSync } from "child_process";
import type {
  IProvider,
  WorkerInfo,
  DeployOptions,
  InvokeOptions,
  InvokeResult,
  FlyAccountConfig,
} from "../core/types.js";

export class FlyProvider implements IProvider {
  readonly name = "fly";
  private apiToken: string;
  private org?: string;
  private region?: string;
  private apiBase = "https://api.machines.dev/v1";

  constructor(config: FlyAccountConfig) {
    this.apiToken = config.api_token;
    this.org = config.org;
    this.region = config.region;
  }

  private async flyApi(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fly API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async deploy(opts: DeployOptions): Promise<WorkerInfo> {
    const region = opts.region ?? this.region ?? "iad";

    try {
      execSync(
        `fly launch --name ${opts.name} --region ${region} --now --yes${this.org ? ` --org ${this.org}` : ""}`,
        {
          env: { ...process.env, FLY_API_TOKEN: this.apiToken },
          stdio: "pipe",
        },
      );
    } catch (err) {
      throw new Error(`Failed to deploy to Fly.io: ${err}`);
    }

    return {
      name: opts.name,
      provider: this.name,
      url: `https://${opts.name}.fly.dev`,
      region,
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
    execSync(`fly apps destroy ${name} --yes`, {
      env: { ...process.env, FLY_API_TOKEN: this.apiToken },
      stdio: "pipe",
    });
  }

  async removeMany(names: string[]): Promise<void> {
    await Promise.all(names.map((n) => this.remove(n)));
  }

  async list(prefix?: string): Promise<WorkerInfo[]> {
    const output = execSync("fly apps list --json", {
      env: { ...process.env, FLY_API_TOKEN: this.apiToken },
      stdio: "pipe",
    }).toString();

    const apps = JSON.parse(output) as Array<{
      Name: string;
      Status: string;
      Hostname: string;
    }>;

    let workers = apps.map((a) => ({
      name: a.Name,
      provider: this.name,
      url: `https://${a.Hostname || a.Name + ".fly.dev"}`,
      status: (a.Status === "running" ? "active" : "unknown") as
        | "active"
        | "unknown",
      createdAt: new Date().toISOString(),
    }));

    if (prefix) {
      workers = workers.filter((w) => w.name.startsWith(prefix));
    }

    return workers;
  }

  async info(name: string): Promise<WorkerInfo> {
    const workers = await this.list();
    const worker = workers.find((w) => w.name === name);
    if (!worker) throw new Error(`App '${name}' not found`);
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
        headers: { "Content-Type": "application/json", ...opts?.headers },
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

      return { workerName: worker.name, statusCode: res.status, body, duration };
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
    const { spawn } = await import("child_process");
    const proc = spawn("fly", ["logs", "--app", name], {
      env: { ...process.env, FLY_API_TOKEN: this.apiToken },
      stdio: ["ignore", "pipe", "pipe"],
    });

    for await (const chunk of proc.stdout) {
      yield chunk.toString();
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      execSync("fly auth whoami", {
        env: { ...process.env, FLY_API_TOKEN: this.apiToken },
        stdio: "pipe",
      });
      return true;
    } catch {
      return false;
    }
  }
}
