import { readFileSync } from "fs";

export function readTargets(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export function shuffleTargets(targets: string[]): string[] {
  const shuffled = [...targets];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function splitTargets(
  targets: string[],
  workerCount: number,
): string[][] {
  if (workerCount <= 0) throw new Error("Worker count must be > 0");
  if (targets.length === 0) return Array.from({ length: workerCount }, () => []);

  const chunks: string[][] = Array.from({ length: workerCount }, () => []);
  const perWorker = Math.floor(targets.length / workerCount);
  const remainder = targets.length % workerCount;

  let offset = 0;
  for (let i = 0; i < workerCount; i++) {
    const size = perWorker + (i < remainder ? 1 : 0);
    chunks[i] = targets.slice(offset, offset + size);
    offset += size;
  }

  return chunks;
}

export function subBatch(targets: string[], batchSize: number): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < targets.length; i += batchSize) {
    batches.push(targets.slice(i, i + batchSize));
  }
  return batches;
}
