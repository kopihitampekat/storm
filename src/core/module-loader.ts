import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { getModulesDir } from "./config.js";
import type { StormModule } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BUILTIN_MODULES_DIR = join(__dirname, "../../modules");

function findModuleFile(name: string): string | null {
  // Check user modules first (~/.storm/modules/)
  const userPath = join(getModulesDir(), `${name}.json`);
  if (existsSync(userPath)) return userPath;

  // Check built-in modules
  const builtinPath = join(BUILTIN_MODULES_DIR, `${name}.json`);
  if (existsSync(builtinPath)) return builtinPath;

  return null;
}

export function loadModule(name: string): StormModule {
  const filePath = findModuleFile(name);
  if (!filePath) {
    throw new Error(
      `Module '${name}' not found. Run 'storm modules --list' to see available modules.`,
    );
  }
  const raw = readFileSync(filePath, "utf-8");
  const module: StormModule = JSON.parse(raw);

  if (!module.name || !module.scanner) {
    throw new Error(
      `Invalid module '${name}': missing required fields (name, scanner)`,
    );
  }

  // Apply defaults
  module.output = module.output ?? { format: "jsonl" };
  module.options = module.options ?? {};
  module.concurrency = module.concurrency ?? {};
  module.concurrency.targetsPerWorker ??= 100;
  module.concurrency.maxConcurrentPerWorker ??= 10;
  module.options.timeout ??= 5000;
  module.options.userAgent ??= "Mozilla/5.0 (compatible; Storm/1.0)";

  return module;
}

export function listModules(): StormModule[] {
  const modules: Map<string, StormModule> = new Map();

  // Load built-in modules
  if (existsSync(BUILTIN_MODULES_DIR)) {
    for (const file of readdirSync(BUILTIN_MODULES_DIR)) {
      if (!file.endsWith(".json")) continue;
      const name = basename(file, ".json");
      try {
        modules.set(name, loadModule(name));
      } catch {
        // skip invalid modules
      }
    }
  }

  // Load user modules (overrides built-in)
  const userDir = getModulesDir();
  if (existsSync(userDir)) {
    for (const file of readdirSync(userDir)) {
      if (!file.endsWith(".json")) continue;
      const name = basename(file, ".json");
      try {
        modules.set(name, loadModule(name));
      } catch {
        // skip invalid modules
      }
    }
  }

  return Array.from(modules.values());
}
