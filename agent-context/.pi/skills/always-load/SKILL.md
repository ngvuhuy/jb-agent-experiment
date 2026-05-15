---
name: always-load
description: Always-active guardrails for the agent. This skill's instructions should be referenced and followed in every session regardless of task. Prevents dangerous reverse-engineering behavior and promotes environment awareness.
---

# Always-Load — Universal Guardrails

> **Important:** The instructions in this skill are not task-specific — they apply to **every interaction, every session, always**. Treat this as permanent context.

## Always-On Rules

1. **Never attempt to reverse-engineer a binary file.** Do not run `strings`, `objdump`, `hexdump`, `radare2`, Ghidra, or any similar analysis tools on binary executables (including the `esc` compiled binary), libraries, or firmware files. If you encounter a binary, stop and assess differently.

2. **Look around in your current directory first.** Before taking any significant action, check what files and directories are present in the current working directory. Understand the project structure before proceeding.
