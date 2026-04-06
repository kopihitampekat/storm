import { randomUUID } from "crypto";
import type {
  IProvider,
  StormModule,
  WorkerInfo,
  ScanRequest,
  ScanResponse,
  ScanResult,
} from "./types.js";
import {
  readTargets,
  shuffleTargets,
  splitTargets,
  subBatch,
} from "./splitter.js";
import { mergeResults, writeOutput } from "./merger.js";

export interface ScanOptions {
  targetFile: string;
  module: StormModule;
  provider: IProvider;
  outputPath?: string;
  fleetPrefix?: string;
  instances?: number;
  dontShuffle?: boolean;
  dontSplit?: boolean;
  spinup?: number;
  rmWhenDone?: boolean;
  extraArgs?: Record<string, unknown>;
  quiet?: boolean;
  onProgress?: (msg: string) => void;
}

export interface ScanStats {
  totalTargets: number;
  totalResults: number;
  totalErrors: number;
  workers: number;
  durationMs: number;
  outputPath?: string;
}

export async function runScan(opts: ScanOptions): Promise<ScanStats> {
  const {
    targetFile,
    module: mod,
    provider,
    outputPath,
    fleetPrefix,
    dontShuffle,
    dontSplit,
    spinup,
    rmWhenDone,
    extraArgs,
    onProgress,
  } = opts;

  const log = onProgress ?? (() => {});
  const scanId = randomUUID().slice(0, 8);
  const startTime = Date.now();

  // 1. Read targets
  log("Reading targets...");
  let targets = readTargets(targetFile);
  if (targets.length === 0) {
    throw new Error("No targets found in file");
  }
  log(`Loaded ${targets.length} targets`);

  if (!dontShuffle) {
    targets = shuffleTargets(targets);
  }

  // 2. Prepare fleet
  let workers: WorkerInfo[];

  if (spinup && spinup > 0) {
    log(`Spinning up ${spinup} workers...`);
    const deployOpts = Array.from({ length: spinup }, (_, i) => ({
      name: `${fleetPrefix ?? "storm"}-${scanId}-${String(i + 1).padStart(3, "0")}`,
    }));
    workers = await provider.deployMany(deployOpts);
  } else {
    log("Discovering workers...");
    const prefix = fleetPrefix ?? "storm";
    workers = await provider.list(prefix);
  }

  if (workers.length === 0) {
    throw new Error(
      "No workers available. Deploy with 'storm fleet' or use --spinup",
    );
  }

  // Health check
  log(`Health-checking ${workers.length} workers...`);
  const healthy: WorkerInfo[] = [];
  await Promise.all(
    workers.map(async (w) => {
      try {
        const res = await provider.invoke(w, null, {
          method: "GET",
          timeout: 5000,
        });
        if (res.statusCode === 200) healthy.push(w);
      } catch {
        // skip unhealthy workers
      }
    }),
  );

  if (healthy.length === 0) {
    throw new Error("No healthy workers found");
  }
  log(`${healthy.length}/${workers.length} workers healthy`);

  // 3. Split targets
  const workerCount = opts.instances
    ? Math.min(opts.instances, healthy.length)
    : healthy.length;
  const activeWorkers = healthy.slice(0, workerCount);

  let chunks: string[][];
  if (dontSplit) {
    chunks = Array.from({ length: workerCount }, () => [...targets]);
  } else {
    chunks = splitTargets(targets, workerCount);
  }

  // 4. Invoke workers
  log(`Distributing targets across ${workerCount} workers...`);
  const mergedOptions = { ...mod.options, ...extraArgs };
  const batchSize = mod.concurrency?.targetsPerWorker ?? 100;

  const allResponses: ScanResponse[] = [];

  await Promise.all(
    activeWorkers.map(async (worker, idx) => {
      const workerTargets = chunks[idx];
      if (workerTargets.length === 0) return;

      const batches = subBatch(workerTargets, batchSize);

      for (const batch of batches) {
        const payload: ScanRequest = {
          scanId,
          module: mod.scanner,
          targets: batch,
          options: mergedOptions,
          outputFormat: mod.output.format,
        };

        try {
          const result = await provider.invoke(worker, payload, {
            method: "POST",
            timeout: (mergedOptions.timeout as number ?? 5000) * batch.length + 30000,
          });

          if (result.statusCode === 200 && result.body) {
            allResponses.push(result.body as ScanResponse);
          } else {
            allResponses.push({
              scanId,
              workerName: worker.name,
              results: [],
              errors: batch.map((t) => ({
                target: t,
                error: `HTTP ${result.statusCode}`,
              })),
              stats: {
                total: batch.length,
                success: 0,
                failed: batch.length,
                durationMs: result.duration,
              },
            });
          }
        } catch (err) {
          allResponses.push({
            scanId,
            workerName: worker.name,
            results: [],
            errors: batch.map((t) => ({
              target: t,
              error: String(err),
            })),
            stats: {
              total: batch.length,
              success: 0,
              failed: batch.length,
              durationMs: 0,
            },
          });
        }
      }

      log(`Worker ${worker.name} done (${workerTargets.length} targets)`);
    }),
  );

  // 5. Merge results
  const allResults: ScanResult[][] = allResponses.map((r) => r.results);
  const totalErrors = allResponses.reduce(
    (sum, r) => sum + r.errors.length,
    0,
  );
  const totalResults = allResponses.reduce(
    (sum, r) => sum + r.results.length,
    0,
  );

  if (outputPath) {
    log("Merging results...");
    const merged = mergeResults(allResults, mod.output.format, mod.output.fields);
    writeOutput(merged, outputPath);
    log(`Results written to ${outputPath}`);
  }

  // 6. Cleanup
  if (rmWhenDone && spinup) {
    log("Removing workers...");
    await provider.removeMany(activeWorkers.map((w) => w.name));
  }

  const durationMs = Date.now() - startTime;

  return {
    totalTargets: targets.length,
    totalResults,
    totalErrors,
    workers: workerCount,
    durationMs,
    outputPath,
  };
}
