---
name: atomic-extensions
description: Safe extension development with atomic commit/rollback. Use when creating or modifying Pi extensions to prevent breaking the running agent.
---

# Atomic Extensions — Safe Extension Development

This skill teaches you how to safely develop Pi extensions using the atomic-extensions system.

## Why Use Atomic Extensions

When you create or modify a Pi extension and reload, a buggy extension can:
- Crash Pi entirely (making it impossible to fix)
- Corrupt the session
- Cause infinite error loops

The atomic system prevents this by:
1. **Staging**: New extensions go to a staging area — they are NOT auto-loaded
2. **Backup**: Before committing, current extensions are backed up
3. **Health check**: After commit+reload, a marker confirms the new extensions loaded successfully
4. **Auto-rollback**: If Pi crashes during reload, the health marker persists → auto-rollback on next startup

## Architecture

```
.pi/extensions/
├── atomic-extensions/     ← Stable manager (never broken, manages the rest)
│   ├── index.ts
│   └── SKILL.md
├── *.ts / */index.ts      ← ACTIVE extensions (the "current root")
├── .atomic/               ← Internal state
│   ├── manifest.json
│   ├── .boot-pending      ← Health check marker
│   ├── .boot-ok           ← Health check marker
│   ├── staging/           ← New extensions (NOT auto-discovered!)
│   └── backup/            ← Previous working extensions
```

## Workflow

### 1. Writing a new extension (ALWAYS use staging)

When the user asks you to create a new extension, use the `write_staging_extension` tool.
This writes the extension to `.pi/extensions/.atomic/staging/` — it will NOT be loaded by Pi.

```typescript
// The tool is available as: write_staging_extension
// Parameters:
//   filename: string    — e.g., "my-tool.ts" or "my-package/"
//   content: string     — Full TypeScript source
//   isDirectory?: bool  — true for subdirectory extensions
```

### 2. Iterating on a staging extension

Read the staging file, modify it, and write it again with `write_staging_extension`.
The extension is still not active — no risk of breaking Pi.

### 3. Committing staging → active

When ready to deploy, tell the user to run `/atomic-commit`.
This:
- Backs up current active extensions to `.atomic/backup/`
- Copies staging files to `.pi/extensions/`
- Writes `.boot-pending` marker
- Reloads Pi

If Pi crashes during reload, the `.boot-pending` marker persists.
On next startup, the atomic extension detects it and auto-rollbacks to backup.

### 4. Rollback (manual)

If a deployment causes runtime errors (not crashes), the user can run `/atomic-rollback`
to restore the previous backup, then `/atomic-reload` to apply it.

### 5. Checking status

`/atomic-status` shows current state, active extensions, staging contents.

## Commands Reference

| Command | Description |
|---------|-------------|
| `/atomic-status` | Show current state, active/staging extensions |
| `/atomic-commit` | Deploy staging → active with backup + health check |
| `/atomic-rollback` | Restore from backup |
| `/atomic-reload` | Reload runtime (after manual changes or rollback) |
| `/atomic-clear-staging` | Clear all files from staging |

## Tools Reference

| Tool | Description |
|------|-------------|
| `write_staging_extension` | Write a new extension to staging (safe, not auto-loaded) |
| `list_staging_extensions` | List extensions currently in staging |

## Safety Guarantees

1. **Staging is safe**: Files in `.pi/extensions/.atomic/staging/` are NEVER auto-discovered by Pi
2. **Backup is complete**: All active extensions (except atomic-extensions itself) are backed up before commit
3. **Crash detection**: `.boot-pending` → `.boot-ok` handshake survives crashes
4. **Auto-rollback**: If a crash is detected on startup, previous working extensions are restored
5. **Atomic-extensions is stable**: The manager extension never goes through staging itself

## When NOT to use atomic extensions

- Modifying the `atomic-extensions` extension itself (do this carefully with manual backup)
- Emergency fixes where you need to quickly patch a broken extension (just write directly)
