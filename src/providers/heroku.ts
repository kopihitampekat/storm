import { execSync } from "child_process";
import type {
  IProvider,
  WorkerInfo,
  DeployOptions,
  InvokeOptions,
  InvokeResult,
  HerokuAccountConfig,
} from "../core/types.js";

export class HerokuProvider implements IProvider {
  readonly name = "heroku";
  private apiKey: string;
  private team?: string;
  private apiBase = "https://api.heroku.com";

  constructor(config: HerokuAccountConfig) {
    this.apiKey = config.api_key;
    this.team = config.team;
  }

  private async herokuApi(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.heroku+json; version=3",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Heroku API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async deploy(opts: DeployOptions): Promise<WorkerInfo> {
    const payload: Record<string, unknown> = {
      name: opts.name,
      region: opts.region ?? "us",
      stack: "heroku-24",
    };
    if (this.team) payload.team = this.team;

    await this.herokuApi("/apps", "POST", payload);

    return {
      name: opts.name,
      provider: this.name,
      url: `https://${opts.name}.herokuapp.com`,
      region: opts.region ?? "us",
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
    await this.herokuApi(`/apps/${name}`, "DELETE");
  }

  async removeMany(names: string[]): Promise<void> {
    await Promise.all(names.map((n) => this.remove(n)));
  }

  async list(prefix?: string): Promise<WorkerInfo[]> {
    const apps = (await this.herokuApi("/apps")) as Array<{
      name: string;
      web_url: string;
      created_at: string;
      region: { name: string };
    }>;

    let workers = apps.map((a) => ({
      name: a.name,
      provider: this.name,
      url: a.web_url,
      region: a.region.name,
      status: "active" as const,
      createdAt: a.created_at,
    }));

    if (prefix) {
      workers = workers.filter((w) => w.name.startsWith(prefix));
    }

    return workers;
  }

  async info(name: string): Promise<WorkerInfo> {
    const app = (await this.herokuApi(`/apps/${name}`)) as {
      name: string;
      web_url: string;
      created_at: string;
      region: { name: string };
    };
    return {
      name: app.name,
      provider: this.name,
      url: app.web_url,
      region: app.region.name,
      status: "active",
      createdAt: app.created_at,
    };
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
          ? `${worker.url}health`
          : `${worker.url}scan`;

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
    const proc = spawn("heroku", ["logs", "--tail", "--app", name], {
      env: { ...process.env, HEROKU_API_KEY: this.apiKey },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for await (const chunk of proc.stdout) {
      yield chunk.toString();
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.herokuApi("/account");
      return true;
    } catch {
      return false;
    }
  }
}
