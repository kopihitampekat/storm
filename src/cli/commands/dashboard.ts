import { Command } from "commander";
import chalk from "chalk";
import { startDashboard } from "../../dashboard/server.js";

export function dashboardCommand(): Command {
  const cmd = new Command("dashboard");

  cmd
    .description("Launch the web dashboard")
    .option("-p, --port <port>", "Port to listen on", "3333")
    .action((options) => {
      const port = parseInt(options.port, 10);
      console.log(chalk.cyan("\n  ⚡ Storm Dashboard\n"));
      console.log(chalk.gray(`  Starting on port ${port}...`));
      startDashboard(port);
    });

  return cmd;
}
