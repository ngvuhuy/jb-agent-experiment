---
name: always-timeout-commands
description: "Always-active guardrail: every bash command invocation must include a 10-second timeout to prevent infinite loops or runaway processes."
---

# Always-Timeouts Commands

> **Always-on rule:** Every `bash` command executed via the agent tool must include a `timeout` of **10 seconds** to prevent infinite loops, hang-ups, or runaway processes.

## Why

Without explicit timeouts, a buggy script, a long-running process, or an accidental infinite loop could block the agent indefinitely. A 10-second ceiling keeps the agent responsive and safe.

## How to apply

When using the `bash` tool, always include `timeout 10` at the start of the command:

```
timeout 10 <command>
```

For example:
- ✅ `timeout 10 python myscript.py`
- ✅ `timeout 10 make build`
- ✅ `timeout 10 npm install`

If the command needs more than 10 seconds, you may increase the timeout *only* when you have a clear reason. The default should always be 10 seconds.

## Scope

This applies to **every** `bash` invocation — compilation, testing, running scripts, network calls, file operations, anything. If you use the `bash` tool, wrap it in `timeout 10`.
