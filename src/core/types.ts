// ── Module Definition ──

export interface StormModule {
  name: string;
  description: string;
  scanner: string;
  options: ScannerOptions;
  output: OutputConfig;
  concurrency?: ConcurrencyConfig;
}

export interface ScannerOptions {
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  method?: string;
  headers?: Record<string, string>;
  wordlist?: string;
  ports?: number[];
  retries?: number;
  userAgent?: string;
  recordTypes?: string[];
  resolver?: string;
  statusCodes?: number[];
  [key: string]: unknown;
}

export interface OutputConfig {
  format: "txt" | "jsonl" | "csv" | "json";
  fields?: string[];
}

export interface ConcurrencyConfig {
  targetsPerWorker?: number;
  maxConcurrentPerWorker?: number;
}

// ── Provider Types ──

export interface WorkerInfo {
  name: string;
  provider: string;
  url: string;
  region?: string;
  status: "active" | "deploying" | "error" | "unknown";
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DeployOptions {
  name: string;
  region?: string;
  envVars?: Record<string, string>;
  workerScript?: string;
}

export interface InvokeOptions {
  timeout?: number;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
}

export interface InvokeResult {
  workerName: string;
  statusCode: number;
  body: unknown;
  duration: number;
  error?: string;
}

export interface IProvider {
  readonly name: string;

  deploy(opts: DeployOptions): Promise<WorkerInfo>;
  deployMany(opts: DeployOptions[]): Promise<WorkerInfo[]>;
  remove(name: string): Promise<void>;
  removeMany(names: string[]): Promise<void>;

  list(prefix?: string): Promise<WorkerInfo[]>;
  info(name: string): Promise<WorkerInfo>;

  invoke(
    worker: WorkerInfo,
    payload: unknown,
    opts?: InvokeOptions,
  ): Promise<InvokeResult>;

  logs(name: string, follow?: boolean): AsyncGenerator<string>;

  validateCredentials(): Promise<boolean>;
}

// ── Scanner Types ──

export interface ScanResult {
  target: string;
  [key: string]: unknown;
}

export interface IScanner {
  name: string;
  init(options: ScannerOptions): Promise<void>;
  scan(target: string): Promise<ScanResult>;
  scanBatch(targets: string[], concurrency: number): Promise<ScanResult[]>;
}

// ── Scan Request/Response (Worker Protocol) ──

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

// ── Config Types ──

export interface StormConfig {
  active_account: string;
  provider: string;
  default_instances: number;
  default_region: string;
  worker_prefix: string;
  log_level: "debug" | "info" | "warn" | "error";
}

export interface AccountConfig {
  provider: string;
  [key: string]: unknown;
}

export interface CloudflareAccountConfig extends AccountConfig {
  provider: "cloudflare";
  account_id: string;
  api_token: string;
  worker_prefix?: string;
}

export interface VercelAccountConfig extends AccountConfig {
  provider: "vercel";
  token: string;
  team_id?: string;
  project_prefix?: string;
}

export interface FlyAccountConfig extends AccountConfig {
  provider: "fly";
  api_token: string;
  org?: string;
  region?: string;
}

export interface HerokuAccountConfig extends AccountConfig {
  provider: "heroku";
  api_key: string;
  team?: string;
}

export interface FirebaseAccountConfig extends AccountConfig {
  provider: "firebase";
  project_id: string;
  service_account_key?: string;
}

export interface GaeAccountConfig extends AccountConfig {
  provider: "gae";
  project_id: string;
  region?: string;
}
