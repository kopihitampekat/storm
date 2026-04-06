import { execSync } from "child_process";
import type {
  IProvider,
  WorkerInfo,
  DeployOptions,
  InvokeOptions,
  InvokeResult,
  FirebaseAccountConfig,
} from "../core/types.js";

export class FirebaseProvider implements IProvider {
  readonly name = "firebase";
  private projectId: string;

  constructor(config: FirebaseAccountConfig) {
    this.projectId = config.project_id;
  }

  async deploy(opts: DeployOptions): Promise<WorkerInfo> {
    try {
      execSync(
        `firebase deploy --only functions:${opts.name} --project ${this.projectId}`,
        { stdio: "pipe" },
      );
    } catch (err) {
      throw new Error(`Failed to deploy Firebase function: ${err}`);
    }

    const region = opts.region ?? "us-central1";
    return {
      name: opts.name,
      provider: this.name,
      url: `https://${region}-${this.projectId}.cloudfunctions.net/${opts.name}`,
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
    execSync(
      `firebase functions:delete ${name} --project ${this.projectId} --force`,
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
      `firebase functions:list --project ${this.projectId} --json`,
      { stdio: "pipe" },
    ).toString();

    let functions: Array<{ name: string; httpsTrigger?: { url: string } }>;
    try {
      functions = JSON.parse(output);
    } catch {
      return [];
    }

    let workers = functions
      .filter((f) => f.httpsTrigger?.url)
      .map((f) => ({
        name: f.name.split("/").pop() ?? f.name,
        provider: this.name,
        url: f.httpsTrigger!.url,
        status: "active" as const,
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
    if (!worker) throw new Error(`Function '${name}' not found`);
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
      const res = await fetch(worker.url, {
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
      "firebase",
      ["functions:log", "--only", name, "--project", this.projectId],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    for await (const chunk of proc.stdout) {
      yield chunk.toString();
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      execSync(`firebase projects:list --json`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }
}
