import { handleScanRequest, type ScanRequest } from "../handler.js";

const WORKER_NAME = process.env.WORKER_NAME ?? "fly-worker";
const PORT = parseInt(process.env.PORT ?? "8080", 10);

const server = Bun?.serve?.({
  port: PORT,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health" || (url.pathname === "/" && request.method === "GET")) {
      return Response.json({
        status: "ok",
        worker: WORKER_NAME,
        provider: "fly",
        timestamp: new Date().toISOString(),
      });
    }

    // Scan endpoint
    if (url.pathname === "/scan" && request.method === "POST") {
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
  },
}) ?? (() => {
  // Node.js fallback
  import("http").then(({ createServer }) => {
    createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", async () => {
        res.setHeader("Content-Type", "application/json");

        if (url.pathname === "/health" || (url.pathname === "/" && req.method === "GET")) {
          res.end(JSON.stringify({
            status: "ok",
            worker: WORKER_NAME,
            provider: "fly",
            timestamp: new Date().toISOString(),
          }));
          return;
        }

        if (url.pathname === "/scan" && req.method === "POST") {
          try {
            const scanReq = JSON.parse(body) as ScanRequest;
            const result = await handleScanRequest(scanReq, WORKER_NAME);
            res.end(JSON.stringify(result));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: `Invalid request: ${err}` }));
          }
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
      });
    }).listen(PORT, () => {
      console.log(`Storm worker listening on port ${PORT}`);
    });
  });
})();

export default server;
