import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { loadAccount } from "../../core/config.js";
import { createProvider } from "../../providers/index.js";

export function lsCommand(): Command {
  const cmd = new Command("ls");

  cmd
    .description("List deployed workers")
    .argument("[prefix]", "Filter by name prefix")
    .option("--json", "Output as JSON")
    .action(async (prefix, options) => {
      try {
        const account = loadAccount();
        const provider = createProvider(account);
        const workers = await provider.list(prefix);

        if (workers.length === 0) {
          console.log(chalk.yellow("No workers found"));
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(workers, null, 2));
          return;
        }

        const table = new Table({
          head: [
            chalk.cyan("Name"),
            chalk.cyan("Provider"),
            chalk.cyan("URL"),
            chalk.cyan("Status"),
            chalk.cyan("Created"),
          ],
          style: { head: [], border: [] },
        });

        for (const w of workers) {
          table.push([
            w.name,
            w.provider,
            w.url,
            w.status === "active"
              ? chalk.green(w.status)
              : chalk.red(w.status),
            new Date(w.createdAt).toLocaleDateString(),
          ]);
        }

        console.log(table.toString());
        console.log(chalk.gray(`\n  Total: ${workers.length} workers\n`));
      } catch (err) {
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });

  return cmd;
}
