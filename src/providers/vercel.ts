import type {
  IProvider,
  WorkerInfo,
  DeployOptions,
  InvokeOptions,
  InvokeResult,
  VercelAccountConfig,
} from "../core/types.js";

export class VercelProvider implements IProvider {
  readonly name = "vercel";
  private token: string;
  private teamId?: string;
  private apiBase = "https://api.vercel.com";

  constructor(config: VercelAccountConfig) {
    this.token = config.token;
    this.teamId = config.team_id;
  }

  private async vercelApi(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    const params = this.teamId ? `?teamId=${this.teamId}` : "";
    const res = await fetch(`${this.apiBase}${path}${params}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vercel API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async deploy(opts: DeployOptions): Promise<WorkerInfo> {
    // Vercel deployments use `vercel deploy` CLI or the REST API
    // For serverless functions, we push a project with the worker code
    const { execSync } = await import("child_process");

    try {
      const output = execSync(
        `vercel deploy --yes --name ${opts.name} --token ${this.token}${this.teamId ? ` --scope ${this.teamId}` : ""}`,
        { stdio: "pipe" },
      ).toString().trim();

      // output is the deployment URL
      return {
        name: opts.name,
        provider: this.name,
        url: output,
        status: "active",
        createdAt: new Date().toISOString(),
      };
    } catch (err) {
      throw new Error(`Failed to deploy to Vercel: ${err}`);
    }
  }

  async deployMany(opts: DeployOptions[]): Promise<WorkerInfo[]> {
    const results: WorkerInfo[] = [];
    for (const opt of opts) {
      results.push(await this.deploy(opt));
    }
    return results;
  }

  async remove(name: string): Promise<void> {
    await this.vercelApi(`/v9/projects/${name}`, "DELETE");
  }

  async removeMany(names: string[]): Promise<void> {
    await Promise.all(names.map((n) => this.remove(n)));
  }

  async list(prefix?: string): Promise<WorkerInfo[]> {
    const result = (await this.vercelApi("/v9/projects")) as {
      projects: Array<{ name: string; createdAt: number; targets?: { production?: { url: string } } }>;
    };

    let workers = result.projects.map((p) => ({
      name: p.name,
      provider: this.name,
      url: p.targets?.production?.url
        ? `https://${p.targets.production.url}`
        : `https://${p.name}.vercel.app`,
      status: "active" as const,
      createdAt: new Date(p.createdAt).toISOString(),
    }));

    if (prefix) {
      workers = workers.filter((w) => w.name.startsWith(prefix));
    }

    return workers;
  }

  async info(name: string): Promise<WorkerInfo> {
    const result = (await this.vercelApi(`/v9/projects/${name}`)) as {
      name: string;
      createdAt: number;
      targets?: { production?: { url: string } };
    };
    return {
      name: result.name,
      provider: this.name,
      url: result.targets?.production?.url
        ? `https://${result.targets.production.url}`
        : `https://${result.name}.vercel.app`,
      status: "active",
      createdAt: new Date(result.createdAt).toISOString(),
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
          ? `${worker.url}/api/health`
          : `${worker.url}/api/scan`;

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

  async *logs(_name: string): AsyncGenerator<string> {
    yield "Vercel logs: use 'vercel logs' CLI for real-time logs\n";
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.vercelApi("/v2/user");
      return true;
    } catch {
      return false;
    }
  }
}
