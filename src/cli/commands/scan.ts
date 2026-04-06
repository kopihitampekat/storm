import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadConfig, loadAccount } from "../../core/config.js";
import { loadModule } from "../../core/module-loader.js";
import { createProvider } from "../../providers/index.js";
import { runScan } from "../../core/orchestrator.js";

export function scanCommand(): Command {
  const cmd = new Command("scan");

  cmd
    .description("Distribute a scan across serverless workers")
    .argument("<targets>", "File containing target list (one per line)")
    .requiredOption("-m, --module <name>", "Scan module to use")
    .option("-o, --output <file>", "Output file path")
    .option("--fleet <prefix>", "Use workers with this prefix")
    .option("-i, --instances <count>", "Number of workers to use", parseInt)
    .option("--provider <name>", "Override provider from config")
    .option("--spinup <count>", "Deploy N new workers for this scan", parseInt)
    .option("--rm-when-done", "Remove workers after scan completes")
    .option("--dont-shuffle", "Don't randomize target order")
    .option("--dont-split", "Send full target list to each worker")
    .option("--extra-args <json>", "Extra scanner options as JSON")
    .option("-q, --quiet", "Suppress progress output")
    .action(async (targetFile, options) => {
      const spinner = ora();

      try {
        const config = loadConfig();
        const providerName = options.provider ?? config.provider;
        const account = loadAccount();

        if (account.provider !== providerName) {
          console.error(
            chalk.red(
              `Active account is for '${account.provider}', not '${providerName}'`,
            ),
          );
          process.exit(1);
        }

        const provider = createProvider(account);
        const mod = loadModule(options.module);

        let extraArgs: Record<string, unknown> = {};
        if (options.extraArgs) {
          try {
            extraArgs = JSON.parse(options.extraArgs);
          } catch {
            console.error(chalk.red("Invalid --extra-args JSON"));
            process.exit(1);
          }
        }

        const outputPath =
          options.output ?? `storm-${options.module}-${Date.now()}.${mod.output.format === "jsonl" ? "jsonl" : mod.output.format}`;

        console.log(chalk.cyan("\n  ⚡ Storm Scan"));
        console.log(chalk.gray(`  Module: ${mod.name}`));
        console.log(chalk.gray(`  Provider: ${providerName}`));
        console.log(chalk.gray(`  Output: ${outputPath}\n`));

        if (!options.quiet) spinner.start("Initializing scan...");

        const stats = await runScan({
          targetFile,
          module: mod,
          provider,
          outputPath,
          fleetPrefix: options.fleet,
          instances: options.instances,
          spinup: options.spinup,
          rmWhenDone: options.rmWhenDone,
          dontShuffle: options.dontShuffle,
          dontSplit: options.dontSplit,
          extraArgs,
          quiet: options.quiet,
          onProgress: (msg) => {
            if (!options.quiet) spinner.text = msg;
          },
        });

        if (!options.quiet) spinner.succeed("Scan complete");

        console.log(chalk.green("\n  Results:"));
        console.log(chalk.white(`    Targets:  ${stats.totalTargets}`));
        console.log(chalk.white(`    Results:  ${stats.totalResults}`));
        console.log(chalk.white(`    Errors:   ${stats.totalErrors}`));
        console.log(chalk.white(`    Workers:  ${stats.workers}`));
        console.log(
          chalk.white(
            `    Duration: ${(stats.durationMs / 1000).toFixed(1)}s`,
          ),
        );
        if (stats.outputPath) {
          console.log(chalk.white(`    Output:   ${stats.outputPath}`));
        }
        console.log();
      } catch (err) {
        spinner.fail(String(err));
        process.exit(1);
      }
    });

  return cmd;
}
