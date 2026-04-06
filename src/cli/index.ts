import { Command } from "commander";
import { scanCommand } from "./commands/scan.js";
import { initCommand } from "./commands/init.js";
import { fleetCommand } from "./commands/fleet.js";
import { lsCommand } from "./commands/ls.js";
import { rmCommand } from "./commands/rm.js";
import { execCommand } from "./commands/exec.js";
import { logsCommand } from "./commands/logs.js";
import { accountCommand } from "./commands/account.js";
import { modulesCommand } from "./commands/modules.js";
import { dashboardCommand } from "./commands/dashboard.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("storm")
    .description("Distributed serverless scanning framework")
    .version("0.1.0");

  program.addCommand(scanCommand());
  program.addCommand(initCommand());
  program.addCommand(fleetCommand());
  program.addCommand(lsCommand());
  program.addCommand(rmCommand());
  program.addCommand(execCommand());
  program.addCommand(logsCommand());
  program.addCommand(accountCommand());
  program.addCommand(modulesCommand());
  program.addCommand(dashboardCommand());

  return program;
}
