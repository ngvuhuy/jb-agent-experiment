# Pi Extension Development — Safety Rules

## ALWAYS use atomic staging for extension development

This project has the **atomic-extensions** safety system installed.

**Rule**: When creating or modifying any Pi extension (except `atomic-extensions` itself), you MUST use the `write_staging_extension` tool to write files to the staging area — NOT directly to `.pi/extensions/`.

### Why

Writing directly to `.pi/extensions/` and reloading risks breaking the Pi agent. The atomic system provides commit/rollback with crash detection.

### Workflow

1. Use `write_staging_extension` to create/modify extensions in staging
2. When the user is ready to deploy, suggest `/atomic-commit`
3. If something breaks, the user can run `/atomic-rollback`
4. Use `/atomic-status` to check state

### Staging location

Extensions in `.pi/extensions/.atomic/staging/` are NEVER auto-loaded by Pi.
Active extensions live in `.pi/extensions/` (managed by the atomic system).
