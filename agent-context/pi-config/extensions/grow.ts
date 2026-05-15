import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

let currentTask: string | null = null;
let growActive = false;

function sanitizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function quoteYaml(s: string): string {
  // Escape double quotes and wrap in quotes for safe YAML values
  return `"${s.replace(/"/g, '\\"')}"`;
}

function ensureSkillDir(task: string, skillName?: string): string {
  const name = skillName || sanitizeName(task) || "grow-task";
  const skillDir = join(process.cwd(), ".pi", "skills", name);
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: ${name}
description: ${quoteYaml(`Self-grown knowledge for task: ${task}`)}
---

# ${name}

## Task

${task}

## Grown Knowledge

<!-- The agent populates this file as it learns. -->

`,
    );
  } else {
    // Ensure existing SKILL.md name matches directory name to prevent conflicts
    const skillFile = join(skillDir, "SKILL.md");
    if (existsSync(skillFile)) {
      const content = readFileSync(skillFile, "utf-8");
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      if (nameMatch && nameMatch[1].trim() !== name) {
        const fixed = content.replace(/^name:\s*(.+)$/m, `name: ${name}`);
        writeFileSync(skillFile, fixed);
      }
    }
  }
  return skillDir;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("grow", {
    description:
      "Activate self-modification mode for a task. Usage: /grow [<skill-name>] <task description>",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        ctx.ui.notify("Usage: /grow [<skill-name>] <task description>", "error");
        return;
      }

      // First word is the skill name, rest is the task description
      const firstSpace = trimmed.indexOf(" ");
      let skillName: string | undefined;
      let taskDescription: string;

      if (firstSpace === -1) {
        // Single word: use as both skill name and task
        skillName = sanitizeName(trimmed);
        taskDescription = trimmed;
      } else {
        const firstWord = trimmed.slice(0, firstSpace);
        skillName = sanitizeName(firstWord);
        taskDescription = trimmed.slice(firstSpace + 1).trim();
        if (!taskDescription) {
          taskDescription = firstWord;
        }
      }

      currentTask = taskDescription;
      growActive = true;

      const skillDir = ensureSkillDir(currentTask, skillName);
      ctx.ui.notify(
        `Grow mode activated. Writing skills to ${skillDir}`,
        "info",
      );

      // Dispatch the agent to start working on the task immediately
      pi.sendUserMessage(
        `Now begin working on the following task:\n\n${currentTask}\n\nYou are in GROW mode. Your goal is to modify yourself to become hyper-focused on this task. Write what you learn into the skill files at ${skillDir} (SKILL.md format). Continuously update what you learned after running the experiments into the skills. You can create custom tools and scripts to help. You have access to Go compiler and Python interpreter. Minimize cost and time while maximizing capability for this specific task.\n\nIMPORTANT FORMATTING INSTRUCTION: When you write findings and discoveries about this task into the SKILL.md file, wrap them in the following XML-like tags:\n\n<findings>\n<finding id=\"1\" title=\"Short descriptive title\">\nBody text describing the finding in detail...\n</finding>\n<finding id=\"2\" title=\"Another finding\">\nBody text...\n</finding>\n</findings>\n\nEach <finding> gets a unique id number and a short title attribute. The body can contain markdown. This tag format is used by the /validate command to automatically verify findings by challenging them with a subagent.\n\nIf there are findings already written in a different format (like **N. Title** or ### Finding N: Title), please convert them to the <findings> tag format.`, { deliverAs: "followUp" },
      );
    },
  });

  pi.registerCommand("ungrow", {
    description:
      "Deactivate grow mode or delete a grown skill folder. Usage: /ungrow",
    handler: async (_args, ctx) => {
      // Always deactivate grow mode
      growActive = false;
      currentTask = null;

      const skillsDir = join(process.cwd(), ".pi", "skills");

      if (!existsSync(skillsDir)) {
        ctx.ui.notify("No skills directory found.", "info");
        return;
      }

      // List skill folders (directories only), excluding built-in ones
      const builtIn = new Set(["always-load", "always-timeout-commands"]);
      const entries = readdirSync(skillsDir).filter((name) => {
        const fullPath = join(skillsDir, name);
        return statSync(fullPath).isDirectory() && !builtIn.has(name);
      });

      if (entries.length === 0) {
        ctx.ui.notify(
          "Grow mode deactivated. No grow skill folders to delete.",
          "info",
        );
        return;
      }

      const items: SelectItem[] = entries.map((name) => ({
        value: name,
        label: name,
        description: `Delete the "${name}" skill folder`,
      }));

      const result = await ctx.ui.custom<string | null>(
        (tui, theme, _kb, done) => {
          const container = new Container();

          container.addChild(
            new DynamicBorder((s: string) => theme.fg("accent", s)),
          );
          container.addChild(
            new Text(
              theme.fg("accent", theme.bold("Select a skill folder to delete")),
              1,
              0,
            ),
          );

          const selectList = new SelectList(
            items,
            Math.min(items.length, 10),
            {
              selectedPrefix: (t) => theme.fg("accent", t),
              selectedText: (t) => theme.fg("accent", t),
              description: (t) => theme.fg("muted", t),
              scrollInfo: (t) => theme.fg("dim", t),
              noMatch: (t) => theme.fg("warning", t),
            },
          );
          selectList.onSelect = (item) => done(item.value);
          selectList.onCancel = () => done(null);
          container.addChild(selectList);

          container.addChild(
            new Text(
              theme.fg(
                "dim",
                "↑↓ navigate • enter select & delete • esc cancel",
              ),
              1,
              0,
            ),
          );
          container.addChild(
            new DynamicBorder((s: string) => theme.fg("accent", s)),
          );

          return {
            render: (w) => container.render(w),
            invalidate: () => container.invalidate(),
            handleInput: (data) => {
              selectList.handleInput(data);
              tui.requestRender();
            },
          };
        },
      );

      if (result) {
        const targetDir = join(skillsDir, result);
        rmSync(targetDir, { recursive: true, force: true });
        ctx.ui.notify(`Deleted skill folder: ${result}`, "info");
      } else {
        ctx.ui.notify("Grow mode deactivated. No folder deleted.", "info");
      }
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (!growActive || !currentTask) return;

    return {
      systemPrompt:
        event.systemPrompt +
        `\n\nYou are modifying yourself to be hyper-focused on the following task. Write what you learned about the task into skill files (SKILL.md format in .pi/skills/) to augment yourself with more info. Continuously update what you learned after running the experiments into the skills. You can write custom tools and scripts to help you with the task. You have access to Go compiler and Python interpreter. Your goal is to be the best at that specific task while minimizing cost and time.\n\nFORMATTING RULE: When writing findings/discoveries in the SKILL.md, wrap them in <findings> tags like this:\n\n<findings>\n<finding id=\"1\" title=\"Descriptive title\">\nBody text...\n</finding>\n</findings>\n\nEach <finding> has a unique id number and a title attribute. The /validate extension uses these tags to automatically parse and challenge each finding. Convert any existing findings to this tag format.\n\nThe task is: ${currentTask}`,
    };
  });
}
