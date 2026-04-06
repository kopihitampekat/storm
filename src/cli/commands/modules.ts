import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { listModules } from "../../core/module-loader.js";

export function modulesCommand(): Command {
  const cmd = new Command("modules");

  cmd
    .description("List available scan modules")
    .option("--json", "Output as JSON")
    .action((options) => {
      const modules = listModules();

      if (modules.length === 0) {
        console.log(chalk.yellow("No modules found"));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(modules, null, 2));
        return;
      }

      console.log(chalk.cyan("\n  Available Modules:\n"));

      const table = new Table({
        head: [
          chalk.cyan("Module"),
          chalk.cyan("Scanner"),
          chalk.cyan("Output"),
          chalk.cyan("Description"),
        ],
        style: { head: [], border: [] },
        colWidths: [18, 16, 10, 45],
        wordWrap: true,
      });

      for (const mod of modules) {
        table.push([
          mod.name,
          mod.scanner,
          mod.output.format,
          mod.description,
        ]);
      }

      console.log(table.toString());
      console.log(chalk.gray(`\n  Total: ${modules.length} modules\n`));
    });

  return cmd;
}
