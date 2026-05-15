import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface Constraint {
  type: string;
  limit: number;
  current: number;
}

const constraints = new Map<string, Constraint>();

function updateTokens(ctx: { getContextUsage?: () => { tokens?: number } | undefined }) {
  const c = constraints.get("tokens");
  if (!c) return false;
  const usage = ctx.getContextUsage?.();
  if (!usage || usage.tokens === undefined) return false;
  c.current = usage.tokens;
  return c.current >= c.limit;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("constraint", {
    description: "Set a constraint (e.g. /constraint tokens 1000000)",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui.notify(
          "Usage: /constraint <type> <limit>. Example: /constraint tokens 1000000",
          "error",
        );
        return;
      }
      const type = parts[0];
      const limit = parseInt(parts[1], 10);
      if (isNaN(limit) || limit <= 0) {
        ctx.ui.notify("Limit must be a positive number", "error");
        return;
      }

      updateTokens(ctx);
      const current = ctx.getContextUsage()?.tokens ?? 0;
      constraints.set(type, { type, limit, current });
      ctx.ui.notify(
        `Constraint set: ${type} = ${limit.toLocaleString()} (current: ${current.toLocaleString()})`,
        "info",
      );
    },
  });

  pi.registerCommand("see-constraints", {
    description: "List all active constraints and their current usage",
    handler: async (_args, ctx) => {
      updateTokens(ctx);
      if (constraints.size === 0) {
        ctx.ui.notify("No constraints set.", "info");
        return;
      }
      const lines = ["Active constraints:"];
      for (const [, c] of constraints) {
        const pct = c.limit > 0 ? Math.round((c.current / c.limit) * 100) : 0;
        lines.push(
          `  ${c.type}: ${c.current.toLocaleString()} / ${c.limit.toLocaleString()} (${pct}%)`,
        );
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.on("message_end", async (_event, ctx) => {
    if (updateTokens(ctx)) {
      const c = constraints.get("tokens")!;
      ctx.ui.notify(
        `Token constraint reached: ${c.current.toLocaleString()} >= ${c.limit.toLocaleString()}. Shutting down.`,
        "error",
      );
      ctx.shutdown();
    }
  });
}
