/**
 * Validate Extension
 *
 * Validates findings in any grown SKILL.md by randomly selecting a finding,
 * challenging it ("assume this is false"), and spawning a subagent to run
 * experiments that try to prove the assumption being false leads to
 * inconsistencies with other findings — thereby proving it must be true.
 *
 * Expects findings wrapped in <findings> tags:
 *   <findings>
 *   <finding id="1" title="Short title">
 *   Body text...
 *   </finding>
 *   </findings>
 *
 * Usage:
 *   /validate                   — random finding from newest skill
 *   /validate <skill-name>      — random finding from named skill
 *   /validate <skill-name> <N>  — specific finding from named skill
 *   /validate <N>               — specific finding from newest/default skill
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  unlinkSync,
  rmdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";

// ── Types ──────────────────────────────────────────────────────────────────
interface Finding {
  number: number;
  title: string;
  text: string;
}

interface SkillEntry {
  name: string;
  path: string;
  mtimeMs: number;
}

// ── Skill discovery ───────────────────────────────────────────────────────
function getSkillsDir(): string {
  return join(process.cwd(), ".pi", "skills");
}

function listGrownSkills(): SkillEntry[] {
  const skillsDir = getSkillsDir();
  if (!existsSync(skillsDir)) return [];

  const builtIn = new Set(["always-load", "always-timeout-commands"]);
  return readdirSync(skillsDir)
    .filter((name) => {
      const fullPath = join(skillsDir, name);
      return statSync(fullPath).isDirectory() && !builtIn.has(name);
    })
    .map((name) => {
      const skillPath = join(skillsDir, name, "SKILL.md");
      const mtimeMs = existsSync(skillPath)
        ? statSync(skillPath).mtimeMs
        : 0;
      return { name, path: skillPath, mtimeMs };
    })
    .filter((s) => existsSync(s.path));
}

function findNewestSkill(): SkillEntry | null {
  const skills = listGrownSkills();
  if (skills.length === 0) return null;
  skills.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return skills[0];
}

function findSkillByName(name: string): SkillEntry | null {
  const skills = listGrownSkills();
  return skills.find((s) => s.name === name) ?? null;
}

// ── Finding parsing ───────────────────────────────────────────────────────

// Primary parser: <finding id="N" title="..."> body </finding>
// Wrapped in optional <findings> container.
function parseFindingsTag(content: string): Finding[] {
  const findings: Finding[] = [];
  const regex =
    /<finding\s+id="(\d+)"\s+title="([^"]*)"\s*>\s*\n?([\s\S]*?)\s*\n?<\/finding>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    findings.push({
      number: parseInt(match[1], 10),
      title: match[2].trim(),
      text: match[3].trim(),
    });
  }
  return findings;
}

// Fallback: ### Finding N: Title\nBody...
function parseFindingsHeading(content: string): Finding[] {
  const findings: Finding[] = [];
  const regex =
    /### Finding\s+(\d+)\s*:\s*(.+)\n([\s\S]*?)(?=\n### Finding\s+\d+\s*:|\n##|\n---|\n$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    findings.push({
      number: parseInt(match[1], 10),
      title: match[2].trim(),
      text: match[3].trim(),
    });
  }
  return findings;
}

// Legacy fallback: **N. Title.** Body... (scans entire doc body)
function parseFindingsLegacy(content: string): Finding[] {
  const findings: Finding[] = [];
  const body = content.replace(/^---[\s\S]*?---\n*/, "");
  const regex =
    /\*\*(\d+)\.\s+(.+?)\*\*\.?\s*([\s\S]*?)(?=\n\*\*\d+\.|\n---|\n###|\n$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    findings.push({
      number: parseInt(match[1], 10),
      title: match[2].trim(),
      text: match[3].trim(),
    });
  }
  return findings;
}

function findAllFindings(content: string): Finding[] {
  // Try tag format first (primary), then heading, then legacy
  const tag = parseFindingsTag(content);
  if (tag.length > 0) return tag;

  const heading = parseFindingsHeading(content);
  if (heading.length > 0) return heading;

  return parseFindingsLegacy(content);
}

// ── Subagent execution ────────────────────────────────────────────────────
function getPiCommand(): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtual = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtual && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript] };
  }
  const execName = basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args: [] };
  }
  return { command: "pi", args: [] };
}

function runValidationSubagent(
  challengePrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpDir = mkdtempSync(join(tmpdir(), "pi-validate-"));
    const promptFile = join(tmpDir, "system-prompt.md");

    const systemPrompt = `You are a validation agent that tests assumptions by running experiments.

${challengePrompt}

Run experiments to either prove or disprove the challenged assumption.
Create test files, run them, observe the output, and draw conclusions.
Report your findings clearly with evidence from actual test runs.`;

    writeFileSync(promptFile, systemPrompt, "utf-8");

    const { command, args: baseArgs } = getPiCommand();
    const args = [
      ...baseArgs,
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--append-system-prompt",
      promptFile,
      "Run experiments to validate the challenged assumption.",
    ];

    const proc = spawn(command, args, {
      cwd: process.cwd(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finalText = "";
    const onAbort = () => {
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5000);
    };

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (
            event.type === "message_end" &&
            event.message?.role === "assistant"
          ) {
            for (const part of event.message.content ?? []) {
              if (part.type === "text") finalText = part.text;
            }
          }
        } catch {
          // partial JSON
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      try { unlinkSync(promptFile); } catch { /* ignore */ }
      try { rmdirSync(tmpDir); } catch { /* ignore */ }

      if (code !== 0 && !finalText) {
        reject(
          new Error(
            `Subagent exited with code ${code}\nstderr: ${stderr.slice(0, 500)}`,
          ),
        );
      } else {
        resolve(finalText || stdout.slice(-3000) || "(no output)");
      }
    });

    proc.on("error", (err) => {
      try { unlinkSync(promptFile); } catch { /* ignore */ }
      try { rmdirSync(tmpDir); } catch { /* ignore */ }
      reject(err);
    });

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }
  });
}

// ── Build challenge prompt ────────────────────────────────────────────────
function buildChallengePrompt(
  skillName: string,
  finding: Finding,
  allFindings: Finding[],
): string {
  const otherFindings = allFindings
    .filter((f) => f.number !== finding.number)
    .slice(0, 10)
    .map((f) => `  - Finding ${f.number}: ${f.title}\n    ${f.text.split("\n")[0].slice(0, 120)}`)
    .join("\n");

  return `# CHALLENGED ASSUMPTION

## Skill: "${skillName}"

## The challenged finding

**Finding ${finding.number}: ${finding.title}**

${finding.text}

## THE CHALLENGE

**Assume this finding is FALSE.**

If this finding were false, it would contradict other established findings in this skill.

## Your mission

1. Run experiments that test this finding.
2. See if the actual behavior matches the finding OR contradicts it.
3. If the finding IS true, then assuming it's false should create contradictions with OTHER findings. Look for contradictions.
4. If the finding IS false, then experiments will show different behavior than what the finding claims.

## Other established findings to check against

${otherFindings || "(no other findings to cross-reference)"}

## Report

Tell me definitively: is the challenged finding VALIDATED (inconsistencies arise when assuming it's false, therefore it must be true) or REFUTED (experiments show the finding is wrong)?`;
}

// ── SKILL.md annotations ──────────────────────────────────────────────────
function markFinding(
  skillPath: string,
  finding: Finding,
  status: "challenged" | "validated" | "refuted",
  evidence?: string,
): void {
  if (!existsSync(skillPath)) return;
  let content = readFileSync(skillPath, "utf-8");

  // Remove any existing marker for this finding
  const existingPattern = new RegExp(
    `<!-- validate:\\w+ finding="${finding.number}"[^>]*-->\\n?`,
    "g",
  );
  content = content.replace(existingPattern, "");

  // Build annotation — insert before the <finding> tag that has this id
  let annotation: string;
  if (status === "challenged") {
    annotation = `<!-- validate:challenged finding="${finding.number}" -->\n`;
  } else {
    const ev = evidence
      ? ` evidence="${evidence.slice(0, 120).replace(/"/g, "'")}"`
      : "";
    annotation = `<!-- validate:${status} finding="${finding.number}" result="${status}"${ev} -->\n`;
  }

  const findingTag = `<finding id="${finding.number}"`;
  content = content.replace(findingTag, `${annotation}${findingTag}`);
  writeFileSync(skillPath, content, "utf-8");
}

function clearAllMarkers(skillPath: string): void {
  if (!existsSync(skillPath)) return;
  let content = readFileSync(skillPath, "utf-8");
  content = content.replace(/<!-- validate:.*?-->\n?/g, "");
  writeFileSync(skillPath, content, "utf-8");
}

// ── The user message renderer ─────────────────────────────────────────────
function renderValidateMessage(
  message: { content: string },
  skillName: string,
): string {
  return `## /validate — "${skillName}"\n\n${message.content}`;
}

// ── Extension ─────────────────────────────────────────────────────────────
export default function (pi: ExtensionAPI) {
  pi.registerCommand("validate", {
    description:
      "Validate a finding from a grown SKILL.md by challenging it with a subagent. " +
      "Usage: /validate [<skill-name>] [<finding-number>]",
    handler: async (args, ctx) => {
      const trimmed = args.trim();

      // Parse arguments: skill name and/or finding number
      const parts = trimmed.split(/\s+/).filter(Boolean);
      let skillArg: string | undefined;
      let numberArg: string | undefined;

      if (parts.length === 0) {
        skillArg = undefined;
        numberArg = undefined;
      } else if (parts.length === 1) {
        if (/^\d+$/.test(parts[0])) {
          numberArg = parts[0];
          skillArg = undefined;
        } else {
          skillArg = parts[0];
          numberArg = undefined;
        }
      } else {
        skillArg = parts[0];
        numberArg = parts[1];
      }

      // 1. Resolve the skill
      let skill: SkillEntry | null = null;

      if (skillArg) {
        skill = findSkillByName(skillArg);
        if (!skill) {
          ctx.ui.notify(`Skill "${skillArg}" not found.`, "error");
          return;
        }
      } else {
        skill = findNewestSkill();
        if (!skill) {
          ctx.ui.notify(
            "No grown skills found. Use /grow to create one first.",
            "error",
          );
          return;
        }
      }

      // 2. Parse findings from the skill
      const content = readFileSync(skill.path, "utf-8");
      const findings = findAllFindings(content);

      if (findings.length === 0) {
        ctx.ui.notify(
          `No findings found in "${skill.name}". Findings must use <finding> tags.`,
          "error",
        );
        return;
      }

      // 3. Select finding
      let selected: Finding | null = null;
      if (numberArg) {
        const num = parseInt(numberArg, 10);
        if (isNaN(num)) {
          ctx.ui.notify(`Invalid finding number: "${numberArg}"`, "error");
          return;
        }
        selected = findings.find((f) => f.number === num) ?? null;
        if (!selected) {
          ctx.ui.notify(
            `Finding #${num} not found in "${skill.name}". Available: ${findings.map((f) => `#${f.number}`).join(", ")}`,
            "error",
          );
          return;
        }
      } else {
        selected = findings[Math.floor(Math.random() * findings.length)];
      }

      if (!selected) {
        ctx.ui.notify("No findings to validate.", "error");
        return;
      }

      // 4. Build the challenge prompt
      const challengePrompt = buildChallengePrompt(
        skill.name,
        selected,
        findings,
      );

      // 5. Mark as challenged
      markFinding(skill.path, selected, "challenged");
      ctx.ui.notify(
        `🧪 Validating Finding #${selected.number} from "${skill.name}": "${selected.title}" — spawned subagent...`,
        "info",
      );

      // 6. Run the subagent
      let subagentOutput: string;
      let exitOk = true;
      try {
        subagentOutput = await runValidationSubagent(
          challengePrompt,
          ctx.signal,
        );
      } catch (err) {
        subagentOutput = `Subagent error: ${err instanceof Error ? err.message : String(err)}`;
        exitOk = false;
      }

      // 7. Determine result
      const lower = subagentOutput.toLowerCase();
      const validated =
        exitOk &&
        (lower.includes("validated") ||
          lower.includes("finding is true") ||
          lower.includes("must be true") ||
          lower.includes("confirmed") ||
          lower.includes("inconsistenc"));
      const refuted =
        exitOk &&
        (lower.includes("refuted") ||
          lower.includes("finding is false") ||
          lower.includes("finding is wrong") ||
          lower.includes("contradict"));

      let resultStatus: "validated" | "refuted" | "challenged";
      if (validated && !refuted) {
        resultStatus = "validated";
      } else if (refuted && !validated) {
        resultStatus = "refuted";
      } else {
        resultStatus = "challenged";
      }

      // 8. Update SKILL.md
      markFinding(
        skill.path,
        selected,
        resultStatus,
        subagentOutput.slice(0, 200),
      );

      // 9. Notify user
      const statusIcon =
        resultStatus === "validated"
          ? "✅"
          : resultStatus === "refuted"
            ? "❌"
            : "⚠️";
      const statusText =
        resultStatus === "validated"
          ? "VALIDATED — inconsistencies confirmed when assuming it's false"
          : resultStatus === "refuted"
            ? "REFUTED — experiments contradict the finding"
            : "INCONCLUSIVE — subagent could not determine";

      ctx.ui.notify(
        `${statusIcon} Finding #${selected.number} in "${skill.name}": ${statusText}`,
        resultStatus === "validated" ? "info" : "warning",
      );

      // 10. Send full result as a message
      pi.sendMessage(
        {
          customType: "validate-result",
          content: renderValidateMessage(
            {
              content: `**Result: ${resultStatus.toUpperCase()}**\n\n### The challenged finding\n\n**Finding #${selected.number}: ${selected.title}**\n\n${selected.text}\n\n### Subagent Output\n\n${subagentOutput}`,
            },
            skill.name,
          ),
          display: true,
          details: {
            skill: skill.name,
            findingNumber: selected.number,
            findingTitle: selected.title,
            result: resultStatus,
          },
        },
        { deliverAs: "nextTurn" },
      );
    },
  });

  pi.registerCommand("validate-list", {
    description:
      "List findings in a skill with their validation status. " +
      "Usage: /validate-list [<skill-name>]",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      let skill: SkillEntry | null = null;

      if (trimmed) {
        skill = findSkillByName(trimmed);
        if (!skill) {
          ctx.ui.notify(`Skill "${trimmed}" not found.`, "error");
          return;
        }
      } else {
        skill = findNewestSkill();
        if (!skill) {
          ctx.ui.notify("No grown skills found.", "error");
          return;
        }
      }

      const content = readFileSync(skill.path, "utf-8");
      const findings = findAllFindings(content);

      if (findings.length === 0) {
        ctx.ui.notify(
          `No findings found in "${skill.name}".`,
          "error",
        );
        return;
      }

      // Read validation markers (HTML comments)
      const markerMap = new Map<number, string>();
      const markerRegex =
        /<!-- validate:(\w+) finding="(\d+)"[^>]*result="(\w+)"[^>]*-->/g;
      let m: RegExpExecArray | null;
      while ((m = markerRegex.exec(content)) !== null) {
        markerMap.set(parseInt(m[2], 10), m[3]);
      }
      const challengedRegex = /<!-- validate:challenged finding="(\d+)"[^>]*-->/g;
      while ((m = challengedRegex.exec(content)) !== null) {
        const num = parseInt(m[1], 10);
        if (!markerMap.has(num)) markerMap.set(num, "challenged");
      }

      let list = `Findings in "${skill.name}" (${findings.length} total):\n`;
      for (const f of findings) {
        const status = markerMap.get(f.number) ?? "untested";
        const icon =
          status === "validated"
            ? "✅"
            : status === "refuted"
              ? "❌"
              : status === "challenged"
                ? "🔍"
                : "⬜";
        list += `\n${icon}  #${f.number}  ${f.title}  [${status}]`;
      }

      ctx.ui.notify(list, "info");
    },
  });

  pi.registerCommand("validate-clear", {
    description:
      "Clear all validation markers from a skill. " +
      "Usage: /validate-clear [<skill-name>]",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      let skill: SkillEntry | null = null;

      if (trimmed) {
        skill = findSkillByName(trimmed);
        if (!skill) {
          ctx.ui.notify(`Skill "${trimmed}" not found.`, "error");
          return;
        }
      } else {
        skill = findNewestSkill();
        if (!skill) {
          ctx.ui.notify("No grown skills found.", "error");
          return;
        }
      }

      clearAllMarkers(skill.path);
      ctx.ui.notify(
        `Cleared all validation markers from "${skill.name}".`,
        "info",
      );
    },
  });
}
