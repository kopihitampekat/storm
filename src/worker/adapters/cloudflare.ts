import { handleScanRequest, type ScanRequest } from "../handler.js";

interface Env {
  WORKER_NAME?: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const workerName = env.WORKER_NAME ?? "cf-worker";

    // Health check
    if (url.pathname === "/health" || url.pathname === "/") {
      return Response.json({
        status: "ok",
        worker: workerName,
        provider: "cloudflare",
        timestamp: new Date().toISOString(),
      });
    }

    // Scan endpoint
    if (url.pathname === "/scan" && request.method === "POST") {
      try {
        const body = (await request.json()) as ScanRequest;
        const result = await handleScanRequest(body, workerName);
        return Response.json(result);
      } catch (err) {
        return Response.json(
          { error: `Invalid request: ${err}` },
          { status: 400 },
        );
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
};
