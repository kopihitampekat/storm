import type { IScanner, ScanResult, ScannerOptions } from "./scanners/interface.js";
import { HttpProbeScanner } from "./scanners/http-probe.js";
import { DnsResolveScanner } from "./scanners/dns-resolve.js";
import { TechDetectScanner } from "./scanners/tech-detect.js";
import { DirBruteScanner } from "./scanners/dir-brute.js";
import { HeaderAuditScanner } from "./scanners/header-audit.js";
import { PortProbeScanner } from "./scanners/port-probe.js";

export interface ScanRequest {
  scanId: string;
  module: string;
  targets: string[];
  options: ScannerOptions;
  outputFormat: string;
}

export interface ScanResponse {
  scanId: string;
  workerName: string;
  results: ScanResult[];
  errors: Array<{ target: string; error: string }>;
  stats: {
    total: number;
    success: number;
    failed: number;
    durationMs: number;
  };
}

const SCANNER_REGISTRY: Record<string, () => IScanner> = {
  "http-probe": () => new HttpProbeScanner(),
  "dns-resolve": () => new DnsResolveScanner(),
  "tech-detect": () => new TechDetectScanner(),
  "dir-brute": () => new DirBruteScanner(),
  "header-audit": () => new HeaderAuditScanner(),
  "port-probe": () => new PortProbeScanner(),
};

export function getAvailableScanners(): string[] {
  return Object.keys(SCANNER_REGISTRY);
}

export async function handleScanRequest(
  request: ScanRequest,
  workerName = "unknown",
): Promise<ScanResponse> {
  const start = Date.now();
  const factory = SCANNER_REGISTRY[request.module];

  if (!factory) {
    return {
      scanId: request.scanId,
      workerName,
      results: [],
      errors: [
        {
          target: "*",
          error: `Unknown scanner: '${request.module}'. Available: ${Object.keys(SCANNER_REGISTRY).join(", ")}`,
        },
      ],
      stats: { total: 0, success: 0, failed: 0, durationMs: 0 },
    };
  }

  const scanner = factory();
  await scanner.init(request.options);

  const concurrency = (request.options.maxConcurrentPerWorker as number) ?? 10;
  const results = await scanner.scanBatch(request.targets, concurrency);

  const errors: Array<{ target: string; error: string }> = [];
  const successResults: ScanResult[] = [];

  for (const result of results) {
    if (result.error) {
      errors.push({ target: result.target, error: result.error as string });
    }
    successResults.push(result);
  }

  return {
    scanId: request.scanId,
    workerName,
    results: successResults,
    errors,
    stats: {
      total: request.targets.length,
      success: successResults.length - errors.length,
      failed: errors.length,
      durationMs: Date.now() - start,
    },
  };
}
