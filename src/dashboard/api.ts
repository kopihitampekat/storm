import { Router } from "express";
import { loadConfig, loadAccount, listAccounts, setActiveAccount } from "../core/config.js";
import { createProvider, listProviders } from "../providers/index.js";
import { listModules, loadModule } from "../core/module-loader.js";
import { runScan } from "../core/orchestrator.js";
import { readFileSync, existsSync } from "fs";
import type { WorkerInfo } from "../core/types.js";

export function apiRouter(): Router {
  const router = Router();

  // ── Status ──
  router.get("/status", (_req, res) => {
    try {
      const config = loadConfig();
      const accounts = listAccounts();
      const modules = listModules();
      res.json({
        config,
        accounts,
        providers: listProviders(),
        moduleCount: modules.length,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Accounts ──
  router.get("/accounts", (_req, res) => {
    try {
      const config = loadConfig();
      const accounts = listAccounts();
      res.json({
        accounts,
        active: config.active_account,
        provider: config.provider,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/accounts/switch", (req, res) => {
    try {
      const { name } = req.body;
      setActiveAccount(name);
      res.json({ success: true, active: name });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // ── Workers ──
  router.get("/workers", async (_req, res) => {
    try {
      const account = loadAccount();
      const provider = createProvider(account);
      const workers = await provider.list();
      res.json({ workers, provider: account.provider });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/workers/deploy", async (req, res) => {
    try {
      const { name, count, prefix, region } = req.body;
      const account = loadAccount();
      const provider = createProvider(account);

      let workers: WorkerInfo[];
      if (count && count > 1) {
        const opts = Array.from({ length: count }, (_, i) => ({
          name: `${prefix ?? "storm"}-${String(i + 1).padStart(3, "0")}`,
          region,
        }));
        workers = await provider.deployMany(opts);
      } else {
        const worker = await provider.deploy({ name: name ?? `storm-${Date.now().toString(36)}`, region });
        workers = [worker];
      }

      res.json({ workers });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/workers/remove", async (req, res) => {
    try {
      const { names } = req.body;
      const account = loadAccount();
      const provider = createProvider(account);
      await provider.removeMany(names);
      res.json({ success: true, removed: names.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/workers/health", async (req, res) => {
    try {
      const { name } = req.body;
      const account = loadAccount();
      const provider = createProvider(account);
      const worker = await provider.info(name);
      const result = await provider.invoke(worker, null, { method: "GET", timeout: 5000 });
      res.json({ healthy: result.statusCode === 200, statusCode: result.statusCode, duration: result.duration });
    } catch (err) {
      res.status(500).json({ error: String(err), healthy: false });
    }
  });

  // ── Modules ──
  router.get("/modules", (_req, res) => {
    try {
      const modules = listModules();
      res.json({ modules });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Scans ──
  router.post("/scan", async (req, res) => {
    try {
      const { targets, module: moduleName, outputPath, fleetPrefix, instances, extraArgs } = req.body;

      if (!targets || !moduleName) {
        res.status(400).json({ error: "targets and module are required" });
        return;
      }

      const account = loadAccount();
      const provider = createProvider(account);
      const mod = loadModule(moduleName);

      // Write targets to temp file
      const tmpFile = `/tmp/storm-scan-${Date.now()}.txt`;
      const { writeFileSync } = await import("fs");
      writeFileSync(tmpFile, Array.isArray(targets) ? targets.join("\n") : targets);

      const output = outputPath ?? `/tmp/storm-results-${Date.now()}.${mod.output.format}`;

      const stats = await runScan({
        targetFile: tmpFile,
        module: mod,
        provider,
        outputPath: output,
        fleetPrefix,
        instances,
        extraArgs,
        onProgress: () => {},
      });

      // Read results
      let results: string | null = null;
      if (existsSync(output)) {
        results = readFileSync(output, "utf-8");
      }

      // Cleanup temp file
      try { (await import("fs")).unlinkSync(tmpFile); } catch { /* ignore */ }

      res.json({ stats, results, outputPath: output });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
