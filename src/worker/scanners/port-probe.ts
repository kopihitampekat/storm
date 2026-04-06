import type { IScanner, ScanResult, ScannerOptions } from "./interface.js";

const COMMON_PORTS = [
  80, 443, 8080, 8443, 8000, 8888, 3000, 3001, 5000, 5001,
  9090, 9443, 4443, 2083, 2087, 2096, 8008, 8081, 8082, 8083,
  8084, 8085, 8086, 8087, 8088, 8089, 8090, 8181, 8282, 8383,
  8880, 9000, 9001, 9002, 9200, 9300, 10000, 10443,
];

export class PortProbeScanner implements IScanner {
  name = "port-probe";
  private timeout = 3000;
  private ports: number[] = COMMON_PORTS;
  private userAgent = "Mozilla/5.0 (compatible; Storm/1.0)";

  async init(options: ScannerOptions): Promise<void> {
    this.timeout = options.timeout ?? this.timeout;
    this.userAgent = options.userAgent ?? this.userAgent;
    if (options.ports && Array.isArray(options.ports)) {
      this.ports = options.ports;
    }
  }

  private async probePort(
    host: string,
    port: number,
  ): Promise<{ port: number; open: boolean; protocol: string; banner?: string }> {
    const protocols = port === 443 || port % 1000 === 443 ? ["https"] : ["http", "https"];

    for (const proto of protocols) {
      const url = `${proto}://${host}:${port}/`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const res = await fetch(url, {
          method: "HEAD",
          headers: { "User-Agent": this.userAgent },
          redirect: "manual",
          signal: controller.signal,
        });
        clearTimeout(timer);

        return {
          port,
          open: true,
          protocol: proto,
          banner: res.headers.get("server") ?? undefined,
        };
      } catch {
        clearTimeout(timer);
      }
    }

    return { port, open: false, protocol: "" };
  }

  async scan(target: string): Promise<ScanResult> {
    const host = target
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "");

    const openPorts: Array<{
      port: number;
      protocol: string;
      banner?: string;
    }> = [];

    // Probe ports with concurrency
    const concurrency = 10;
    const queue = [...this.ports];
    const running: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      while (queue.length > 0) {
        const port = queue.shift()!;
        const result = await this.probePort(host, port);
        if (result.open) {
          openPorts.push({
            port: result.port,
            protocol: result.protocol,
            banner: result.banner,
          });
        }
      }
    };

    for (let i = 0; i < Math.min(concurrency, this.ports.length); i++) {
      running.push(runNext());
    }
    await Promise.all(running);

    openPorts.sort((a, b) => a.port - b.port);

    return {
      target,
      host,
      openPorts,
      totalScanned: this.ports.length,
      totalOpen: openPorts.length,
    };
  }

  async scanBatch(targets: string[], concurrency: number): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const queue = [...targets];
    const running: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      while (queue.length > 0) {
        const target = queue.shift()!;
        results.push(await this.scan(target));
      }
    };

    for (let i = 0; i < Math.min(concurrency, targets.length); i++) {
      running.push(runNext());
    }
    await Promise.all(running);
    return results;
  }
}
