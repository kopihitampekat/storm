import { execSync } from "child_process";
import type {
  IProvider,
  WorkerInfo,
  DeployOptions,
  InvokeOptions,
  InvokeResult,
  GaeAccountConfig,
} from "../core/types.js";

export class GaeProvider implements IProvider {
  readonly name = "gae";
  private projectId: string;
  private region: string;

  constructor(config: GaeAccountConfig) {
    this.projectId = config.project_id;
    this.region = config.region ?? "us-central";
  }

  async deploy(opts: DeployOptions): Promise<WorkerInfo> {
    try {
      execSync(
        `gcloud app deploy --project ${this.projectId} --version ${opts.name} --quiet`,
        { stdio: "pipe" },
      );
    } catch (err) {
      throw new Error(`Failed to deploy to App Engine: ${err}`);
    }

    return {
      name: opts.name,
      provider: this.name,
      url: `https://${opts.name}-dot-${this.projectId}.appspot.com`,
      region: this.region,
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
    execSync(
      `gcloud app versions delete ${name} --project ${this.projectId} --quiet`,
      { stdio: "pipe" },
    );
  }

  async removeMany(names: string[]): Promise<void> {
    for (const name of names) {
      await this.remove(name);
    }
  }

  async list(prefix?: string): Promise<WorkerInfo[]> {
    const output = execSync(
      `gcloud app versions list --project ${this.projectId} --format json`,
      { stdio: "pipe" },
    ).toString();

    let versions: Array<{ id: string; servingStatus: string; createTime: string }>;
    try {
      versions = JSON.parse(output);
    } catch {
      return [];
    }

    let workers = versions.map((v) => ({
      name: v.id,
      provider: this.name,
      url: `https://${v.id}-dot-${this.projectId}.appspot.com`,
      status: (v.servingStatus === "SERVING" ? "active" : "unknown") as
        | "active"
        | "unknown",
      createdAt: v.createTime,
    }));

    if (prefix) {
      workers = workers.filter((w) => w.name.startsWith(prefix));
    }

    return workers;
  }

  async info(name: string): Promise<WorkerInfo> {
    const workers = await this.list();
    const worker = workers.find((w) => w.name === name);
    if (!worker) throw new Error(`Version '${name}' not found`);
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
    const proc = spawn(
      "gcloud",
      [
        "app", "logs", "read",
        "--project", this.projectId,
        "--version", name,
        "--limit", "100",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    for await (const chunk of proc.stdout) {
      yield chunk.toString();
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      execSync(
        `gcloud projects describe ${this.projectId} --format json`,
        { stdio: "pipe" },
      );
      return true;
    } catch {
      return false;
    }
  }
}
