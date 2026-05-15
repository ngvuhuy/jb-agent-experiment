/**
 * Always-Load Skills Extension
 *
 * Finds all skills with names starting with "always-" and forcibly injects
 * their full SKILL.md content into the system prompt on every turn.
 *
 * This solves the "progressive disclosure" problem for always-active guardrail
 * skills — they should be in context every session, not just when the model
 * proactively discovers them.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile, readdir, stat } from "node:fs/promises";

export default function (pi: ExtensionAPI) {
	// Cache for always-skill content: { skillName: fullMarkdownContent }
	let alwaysSkillContent: Array<{ name: string; content: string }> = [];

	pi.on("session_start", async (_event, ctx) => {
		alwaysSkillContent = [];

		// Discover "always-" skills by scanning the skill directories directly.
		// This mirrors how pi discovers skills itself but filters for always-*.
		const skillDirs = [
			"/workspace/.pi/skills",       // project-level
			"/root/.pi/agent/skills",      // global
		];

		for (const dir of skillDirs) {
			try {
				const entries = await readdir(dir);
				for (const entry of entries) {
					// Check if it's a directory with a SKILL.md
					const skillDir = `${dir}/${entry}`;
					const skillFile = `${skillDir}/SKILL.md`;
					try {
						const filestat = await stat(skillFile);
						if (!filestat.isFile()) continue;

						// Read frontmatter to get the name
						const content = await readFile(skillFile, "utf-8");
						const nameMatch = content.match(/^---\nname:\s*(.+)\n/m);
						const name = nameMatch?.[1]?.trim();

						if (name && name.startsWith("always-")) {
							alwaysSkillContent.push({ name, content });
						}
					} catch {
						// Not a skill directory, skip
					}
				}
			} catch {
				// Directory doesn't exist, skip
			}
		}

		// Fallback: also check systemPromptOptions.skills if available
		// (we can't access it here in session_start directly, but before_agent_start has it)

		ctx.ui.setStatus(
			"always-skills",
			`Always-skills: ${alwaysSkillContent.map((s) => s.name).join(", ") || "none"}`,
		);
	});

	pi.on("before_agent_start", async (event) => {
		const { systemPrompt, systemPromptOptions } = event;

		// Also discover skills from systemPromptOptions.skills
		// (in case they come from other locations not in our scanned dirs)
		if (systemPromptOptions.skills && systemPromptOptions.skills.length > 0) {
			for (const skill of systemPromptOptions.skills) {
				if (
					skill.name.startsWith("always-") &&
					!alwaysSkillContent.some((s) => s.name === skill.name)
				) {
					try {
						const content = await readFile(skill.filePath, "utf-8");
						alwaysSkillContent.push({ name: skill.name, content });
					} catch {
						// Can't read the file, skip
					}
				}
			}
		}

		if (alwaysSkillContent.length === 0) {
			return; // No always-skills found, return nothing so systemPrompt is unchanged
		}

		// Build the injection block
		const injectionParts = alwaysSkillContent.map(
			(skill) =>
				`<always_skill name="${skill.name}">\n${skill.content}\n</always_skill>`,
		);

		const injection = `

## Always-Active Skills

The following skills have been automatically loaded because they are marked as "always-active" guardrails. Their instructions apply to **every interaction** in this session.

${injectionParts.join("\n\n")}
`;

		return {
			systemPrompt: systemPrompt + injection,
		};
	});

	pi.on("session_shutdown", () => {
		alwaysSkillContent = [];
	});
}


