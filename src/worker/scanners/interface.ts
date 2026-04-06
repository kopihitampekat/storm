export interface ScanResult {
  target: string;
  [key: string]: unknown;
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

export interface IScanner {
  name: string;
  init(options: ScannerOptions): Promise<void>;
  scan(target: string): Promise<ScanResult>;
  scanBatch(targets: string[], concurrency: number): Promise<ScanResult[]>;
}
