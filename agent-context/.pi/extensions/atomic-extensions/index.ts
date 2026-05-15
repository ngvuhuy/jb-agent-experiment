/**
 * Atomic Extensions — Safe extension development for Pi
 *
 * Inspired by atomic Linux distros (Fedora Atomic, Endless OS):
 * - New extensions always go to a STAGING area (NOT auto-discovered)
 * - Only when explicitly COMMITTED are they moved to the active directory
 * - Before commit, a full backup of current extensions is taken
 * - After commit + reload, a health check confirms the new extensions work
 * - If pi CRASHES during reload, the health marker persists → auto-rollback on next startup
 *
 * This extension itself is NEVER put through staging — it's stable and self-hosting.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	readFile,
	writeFile,
	mkdir,
	readdir,
	cp,
	rm,
	stat,
	rename,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Paths ──────────────────────────────────────────────────────────────────
// Resolve relative to THIS file's location
const EXTENSIONS_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const ATOMIC_DIR = path.join(EXTENSIONS_DIR, ".atomic");
const STAGING_DIR = path.join(ATOMIC_DIR, "staging");
const BACKUP_DIR = path.join(ATOMIC_DIR, "backup");
const MANIFEST_PATH = path.join(ATOMIC_DIR, "manifest.json");
const BOOT_PENDING_PATH = path.join(ATOMIC_DIR, ".boot-pending");
const BOOT_OK_PATH = path.join(ATOMIC_DIR, ".boot-ok");

interface Manifest {
	state: "idle" | "pending" | "ok";
	deployedAt?: number;
	lastRollbackAt?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readManifest(): Promise<Manifest> {
	try {
		const content = await readFile(MANIFEST_PATH, "utf-8");
		return JSON.parse(content);
	} catch {
		return { state: "idle" };
	}
}

async function writeManifest(m: Manifest): Promise<void> {
	await mkdir(ATOMIC_DIR, { recursive: true });
	await writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

/** Get a list of active extension names (files and subdirs) in the extensions dir,
 *  EXCLUDING the atomic-extensions meta-manager itself and hidden files. */
async function getActiveExtensions(): Promise<string[]> {
	const entries = await readdir(EXTENSIONS_DIR, { withFileTypes: true });
	const result: string[] = [];

	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue; // skip .atomic and hidden files
		if (entry.name === "atomic-extensions") continue; // skip self

		if (entry.isFile() && entry.name.endsWith(".ts")) {
			result.push(entry.name);
		} else if (entry.isDirectory()) {
			const indexPath = path.join(EXTENSIONS_DIR, entry.name, "index.ts");
			try {
				const s = await stat(indexPath);
				if (s.isFile()) result.push(entry.name);
			} catch {
				// no index.ts in this directory, skip
			}
		}
	}
	return result.sort();
}

/** Copy a set of extensions from source to dest directory. */
async function copyExtensions(
	srcDir: string,
	dstDir: string,
	names: string[],
): Promise<void> {
	await mkdir(dstDir, { recursive: true });
	for (const name of names) {
		const src = path.join(srcDir, name);
		const dst = path.join(dstDir, name);
		// Remove existing at dest first
		try {
			await rm(dst, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
		await cp(src, dst, { recursive: true, force: true });
	}
}

/** Remove a set of extensions from the active directory. */
async function removeExtensions(names: string[]): Promise<void> {
	for (const name of names) {
		const p = path.join(EXTENSIONS_DIR, name);
		try {
			await rm(p, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
}

/** List staging contents: flat .ts files and subdirectories with index.ts */
async function listStaging(): Promise<string[]> {
	try {
		const entries = await readdir(STAGING_DIR, { withFileTypes: true });
		const result: string[] = [];
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			if (entry.isFile() && entry.name.endsWith(".ts")) {
				result.push(entry.name);
			} else if (entry.isDirectory()) {
				const indexPath = path.join(STAGING_DIR, entry.name, "index.ts");
				try {
					const s = await stat(indexPath);
					if (s.isFile()) result.push(entry.name);
				} catch {
					/* no index.ts */
				}
			}
		}
		return result.sort();
	} catch {
		return [];
	}
}

// ─── Extension Entrypoint ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ── Session Start: Check health markers ──────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		const hasBootPending = existsSync(BOOT_PENDING_PATH);
		const hasBootOk = existsSync(BOOT_OK_PATH);

		if (hasBootPending && !hasBootOk) {
			// Crash scenario! A deployment was started but BOOT_OK was never written.
			// This means the reload crashed before this extension's session_start fired.
			// Auto-rollback to the backup.
			ctx.ui.notify(
				"⚠️  Crash detected after extension deployment — auto-rolling back...",
				"error",
			);

			const manifest = await readManifest();
			if (manifest.state === "pending" || manifest.state === "ok") {
				// Restore from backup
				const backupExtensions = await readdir(BACKUP_DIR).catch(() => [] as string[]);
				if (backupExtensions.length > 0) {
					// Remove currently active extensions (except self)
					const active = await getActiveExtensions();
					await removeExtensions(active);
					// Copy backup back
					await copyExtensions(BACKUP_DIR, EXTENSIONS_DIR, backupExtensions);
					manifest.state = "idle";
					manifest.lastRollbackAt = Date.now();
					await writeManifest(manifest);
					ctx.ui.notify("✅ Rolled back to previous working extensions", "success");
					ctx.ui.notify(
						"🔄 A reload is needed. Run /atomic-reload to apply the rollback.",
						"info",
					);
				}
			}

			// Clean up health markers
			try {
				await rm(BOOT_PENDING_PATH, { force: true });
			} catch {
				/* ignore */
			}
		} else if (hasBootPending && hasBootOk) {
			// Normal case: deployment succeeded, clean up
			try {
				await rm(BOOT_PENDING_PATH, { force: true });
				await rm(BOOT_OK_PATH, { force: true });
			} catch {
				/* ignore */
			}
			const manifest = await readManifest();
			if (manifest.state === "pending") {
				manifest.state = "ok";
				manifest.deployedAt = Date.now();
				await writeManifest(manifest);
				ctx.ui.notify(
					"🔁 Atomic deployment confirmed — new extensions are active",
					"success",
				);
			}
		}
	});

	// ── Commands ────────────────────────────────────────────────────────────

	/**
	 * /atomic-status - Show current atomic state
	 */
	pi.registerCommand("atomic-status", {
		description: "Show atomic extensions state",
		handler: async (_args, ctx) => {
			const manifest = await readManifest();
			const active = await getActiveExtensions();
			const staging = await listStaging();
			const hasPending = existsSync(BOOT_PENDING_PATH);
			const hasOk = existsSync(BOOT_OK_PATH);

			const lines: string[] = [
				"━━━ Atomic Extensions Status ━━━",
				`State: ${manifest.state}`,
				`Active extensions: ${active.length ? active.join(", ") : "none (only atomic)"}`,
				`Staging extensions: ${staging.length ? staging.join(", ") : "none"}`,
				`Boot markers: ${hasPending ? "PENDING " : ""}${hasOk ? "OK" : ""}`,
			];
			if (manifest.deployedAt)
				lines.push(`Last deploy: ${new Date(manifest.deployedAt).toISOString()}`);
			if (manifest.lastRollbackAt)
				lines.push(`Last rollback: ${new Date(manifest.lastRollbackAt).toISOString()}`);

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	/**
	 * /atomic-commit - Deploy staging extensions to active directory
	 *
	 * 1. Backs up current extensions to .atomic/backup/
	 * 2. Copies staging files to the active extensions directory
	 * 3. Writes BOOT_PENDING marker
	 * 4. Reloads
	 */
	pi.registerCommand("atomic-commit", {
		description: "Deploy staging extensions to active (with backup + health check)",
		handler: async (_args, ctx) => {
			const staging = await listStaging();
			if (staging.length === 0) {
				ctx.ui.notify("Nothing in staging to commit.", "warning");
				return;
			}

			// Step 1: Backup current active extensions
			const active = await getActiveExtensions();
			if (active.length > 0) {
				// Clear old backup
				try {
					await rm(BACKUP_DIR, { recursive: true, force: true });
				} catch {
					/* ignore */
				}
				await copyExtensions(EXTENSIONS_DIR, BACKUP_DIR, active);
				ctx.ui.notify(
					`📦 Backed up ${active.length} extension(s) to .atomic/backup/`,
					"info",
				);
			}

			// Step 2: Copy staging → active (overwriting any existing)
			const overwritten: string[] = [];
			const added: string[] = [];
			for (const name of staging) {
				const src = path.join(STAGING_DIR, name);
				const dst = path.join(EXTENSIONS_DIR, name);
				const existed = existsSync(dst);
				try {
					await rm(dst, { recursive: true, force: true });
				} catch {
					/* ignore */
				}
				await cp(src, dst, { recursive: true, force: true });
				if (existed) overwritten.push(name);
				else added.push(name);
			}

			// Clear staging after successful copy
			for (const name of staging) {
				try {
					await rm(path.join(STAGING_DIR, name), { recursive: true, force: true });
				} catch {
					/* ignore */
				}
			}

			// Step 3: Write boot markers
			await writeManifest({ state: "pending" });
			await writeFile(BOOT_PENDING_PATH, String(Date.now()));
			// Remove any stale OK marker
			try {
				await rm(BOOT_OK_PATH, { force: true });
			} catch {
				/* ignore */
			}

			ctx.ui.notify(
				`🚀 Deployed: ${added.length ? `new: ${added.join(", ")} ` : ""}${overwritten.length ? `replaced: ${overwritten.join(", ")}` : ""}`,
				"success",
			);
			ctx.ui.notify(
				"🔄 Reloading to activate... Health check will confirm success.",
				"info",
			);

			// Step 4: Reload (the BOOT_PENDING marker ensures fallback if crash)
			await ctx.reload();
		},
	});

	/**
	 * /atomic-rollback - Restore extensions from backup
	 */
	pi.registerCommand("atomic-rollback", {
		description: "Roll back extensions to the previous backup",
		handler: async (_args, ctx) => {
			const backupEntries = await readdir(BACKUP_DIR).catch(() => [] as string[]);
			if (backupEntries.length === 0) {
				ctx.ui.notify("No backup available to restore.", "warning");
				return;
			}

			// Remove current active extensions (except self)
			const active = await getActiveExtensions();
			await removeExtensions(active);

			// Copy backup back
			await copyExtensions(BACKUP_DIR, EXTENSIONS_DIR, backupEntries);

			const manifest = await readManifest();
			manifest.state = "idle";
			manifest.lastRollbackAt = Date.now();
			await writeManifest(manifest);

			// Clean health markers
			try {
				await rm(BOOT_PENDING_PATH, { force: true });
				await rm(BOOT_OK_PATH, { force: true });
			} catch {
				/* ignore */
			}

			ctx.ui.notify(
				`✅ Rolled back to backup (${backupEntries.length} extension(s))`,
				"success",
			);
			ctx.ui.notify(
				"🔄 Run /atomic-reload to apply the rollback, or manually restart pi.",
				"info",
			);
		},
	});

	/**
	 * /atomic-reload - Reload the runtime (needed after rollback or manual changes)
	 */
	pi.registerCommand("atomic-reload", {
		description: "Reload Pi runtime (apply rollback or manual changes)",
		handler: async (_args, ctx) => {
			ctx.ui.notify("🔄 Reloading Pi runtime...", "info");
			await ctx.reload();
		},
	});

	/**
	 * /atomic-clear-staging - Clear all files from staging
	 */
	pi.registerCommand("atomic-clear-staging", {
		description: "Remove all files from the staging area",
		handler: async (_args, ctx) => {
			const staging = await listStaging();
			if (staging.length === 0) {
				ctx.ui.notify("Staging is already empty.", "info");
				return;
			}
			for (const name of staging) {
				try {
					await rm(path.join(STAGING_DIR, name), { recursive: true, force: true });
				} catch {
					/* ignore */
				}
			}
			ctx.ui.notify(`🧹 Cleared ${staging.length} extension(s) from staging`, "info");
		},
	});

	// ── Custom Tool (LLM-callable) ─────────────────────────────────────────

	/**
	 * write_staging_extension — Lets the LLM write new extensions to the staging
	 * area rather than directly into the active extensions directory.
	 */
	pi.registerTool({
		name: "write_staging_extension",
		label: "Write Staging Extension",
		description:
			"Write a new extension file to the STAGING area (.atomic/staging/). " +
			"Extensions in staging are NOT active — they must be committed with /atomic-commit to become active. " +
			"Use this instead of writing directly to .pi/extensions/.",
		parameters: Type.Object({
			filename: Type.String({
				description:
					"Extension filename (e.g., 'my-tool.ts') or directory name (e.g., 'my-extension/')",
			}),
			content: Type.String({
				description: "Full TypeScript source code of the extension",
			}),
			isDirectory: Type.Optional(
				Type.Boolean({
					description:
						"If true, creates a subdirectory (creates index.ts inside it)",
					default: false,
				}),
			),
		}),
		async execute(
			_toolCallId,
			params,
			_signal,
			_onUpdate,
			_ctx,
		) {
			await mkdir(STAGING_DIR, { recursive: true });

			const { filename, content, isDirectory } = params;
			let targetPath: string;

			if (isDirectory) {
				// Create as subdirectory with index.ts
				const dirName = filename.endsWith("/") ? filename.slice(0, -1) : filename;
				targetPath = path.join(STAGING_DIR, dirName, "index.ts");
				await mkdir(path.dirname(targetPath), { recursive: true });
			} else {
				// Ensure .ts extension
				const fname = filename.endsWith(".ts") ? filename : `${filename}.ts`;
				targetPath = path.join(STAGING_DIR, fname);
			}

			await mkdir(path.dirname(targetPath), { recursive: true });
			await writeFile(targetPath, content, "utf-8");

			const relative = path.relative(STAGING_DIR, targetPath);
			const stagingList = await listStaging();

			return {
				content: [
					{
						type: "text",
						text:
							`✅ Written to staging: ${relative}\n\n` +
							`This extension is NOT yet active. ` +
							`To activate it, run \`/atomic-commit\` which will:\n` +
							`1. Back up current active extensions\n` +
							`2. Copy staging → active directory\n` +
							`3. Reload Pi with health check markers\n\n` +
							`Current staging contents: ${stagingList.length ? stagingList.join(", ") : "none"}`,
					},
				],
				details: {
					stagingPath: relative,
					stagingContents: stagingList,
				},
			};
		},
	});

	/**
	 * list_staging_extensions — Lists what's currently in staging
	 */
	pi.registerTool({
		name: "list_staging_extensions",
		label: "List Staging Extensions",
		description: "List all extension files currently in the staging area",
		parameters: Type.Object({}),
		async execute() {
			const staging = await listStaging();
			return {
				content: [
					{
						type: "text",
						text:
							staging.length > 0
								? `Extensions in staging:\n${staging.map((s) => `  • ${s}`).join("\n")}`
								: "Staging is empty.",
					},
				],
				details: { staging },
			};
		},
	});

	// First-run setup: initialize manifest if missing
	(async () => {
		try {
			await stat(MANIFEST_PATH);
		} catch {
			await writeManifest({ state: "idle" });
		}
	})();
}
