import { handleScanRequest, type ScanRequest } from "../handler.js";

const WORKER_NAME = process.env.WORKER_NAME ?? "vercel-worker";

export async function GET(): Promise<Response> {
  return Response.json({
    status: "ok",
    worker: WORKER_NAME,
    provider: "vercel",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/scan") {
    try {
      const body = (await request.json()) as ScanRequest;
      const result = await handleScanRequest(body, WORKER_NAME);
      return Response.json(result);
    } catch (err) {
      return Response.json(
        { error: `Invalid request: ${err}` },
        { status: 400 },
      );
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
