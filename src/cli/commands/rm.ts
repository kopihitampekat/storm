import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadAccount } from "../../core/config.js";
import { createProvider } from "../../providers/index.js";

export function rmCommand(): Command {
  const cmd = new Command("rm");

  cmd
    .description("Remove deployed workers")
    .argument("<pattern>", "Worker name or prefix pattern (e.g., 'storm-*')")
    .option("-f, --force", "Skip confirmation")
    .action(async (pattern, options) => {
      try {
        const account = loadAccount();
        const provider = createProvider(account);

        // Find matching workers
        const prefix = pattern.replace(/\*$/, "");
        const workers = await provider.list(prefix);

        if (workers.length === 0) {
          console.log(chalk.yellow(`No workers matching '${pattern}'`));
          return;
        }

        console.log(
          chalk.yellow(
            `\n  Found ${workers.length} worker(s) to remove:\n`,
          ),
        );
        for (const w of workers) {
          console.log(`    ${chalk.red("✕")} ${w.name}`);
        }
        console.log();

        if (!options.force) {
          const readline = await import("readline");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const answer = await new Promise<string>((resolve) => {
            rl.question("  Confirm removal? (y/N) ", resolve);
          });
          rl.close();

          if (answer.toLowerCase() !== "y") {
            console.log(chalk.gray("  Cancelled\n"));
            return;
          }
        }

        const spinner = ora(
          `Removing ${workers.length} workers...`,
        ).start();

        await provider.removeMany(workers.map((w) => w.name));

        spinner.succeed(
          `Removed ${chalk.cyan(String(workers.length))} workers`,
        );
      } catch (err) {
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
