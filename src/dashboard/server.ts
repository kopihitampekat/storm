import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { apiRouter } from "./api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function startDashboard(port: number): void {
  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, "public")));

  app.use("/api", apiRouter());

  app.get("/{*splat}", (_req, res) => {
    res.sendFile(join(__dirname, "public", "index.html"));
  });

  app.listen(port, () => {
    console.log(`\n  ⚡ Storm Dashboard running at http://localhost:${port}\n`);
  });
}
