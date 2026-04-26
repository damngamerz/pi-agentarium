import type { AutocompleteItem } from "@mariozechner/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { cleanupStaleHeartbeats, HeartbeatStore } from "./heartbeat.js";
import { GardenMemory } from "./garden-memory.js";
import { AgentariumState } from "./state.js";
import type { AgentariumView } from "./types.js";
import { AgentariumOverlay, AgentariumWidget, formatStatus, workingIndicatorFrames } from "./ui/components.js";

const COMMANDS: AutocompleteItem[] = [
  { value: "flowers", label: "flowers", description: "Open the living wildflower meadow" },
  { value: "pond", label: "pond", description: "Open the koi pond view" },
  { value: "constellation", label: "constellation", description: "Open the multi-agent constellation" },
  { value: "sand", label: "sand", description: "Open the zen sand view" },
  { value: "dashboard", label: "dashboard", description: "Open the multi-agent dashboard" },
  { value: "demo", label: "demo", description: "Open with simulated agent activity" },
  { value: "mode", label: "mode", description: "Set the bottom widget mode without opening the overlay" },
  { value: "mode flowers", label: "mode flowers", description: "Set bottom widget to flowers" },
  { value: "mode pond", label: "mode pond", description: "Set bottom widget to pond" },
  { value: "mode constellation", label: "mode constellation", description: "Set bottom widget to constellation" },
  { value: "mode sand", label: "mode sand", description: "Set bottom widget to sand" },
  { value: "on", label: "on", description: "Enable the ambient widget" },
  { value: "off", label: "off", description: "Disable the ambient widget" },
  { value: "status", label: "status", description: "Show current Agentarium status" },
  { value: "above", label: "above", description: "Place the ambient widget above the editor" },
  { value: "below", label: "below", description: "Place the ambient widget below the editor" },
];

function normalizeView(input: string | undefined): AgentariumView | undefined {
  const value = input?.toLowerCase();
  if (value === "flowers" || value === "flower" || value === "meadow" || value === "jungle") return "flowers";
  if (value === "pond" || value === "koi") return "pond";
  if (value === "constellation" || value === "sky" || value === "dashboard") return "constellation";
  if (value === "sand") return "sand";
  return undefined;
}

function installWidget(ctx: ExtensionContext, state: AgentariumState): void {
  if (!ctx.hasUI) return;
  if (!state.config.enabled) {
    ctx.ui.setWidget("agentarium", undefined);
    ctx.ui.setWorkingIndicator();
    ctx.ui.setStatus("agentarium", undefined);
    return;
  }
  ctx.ui.setWidget(
    "agentarium",
    (tui, theme) => new AgentariumWidget(tui, theme, state),
    { placement: state.config.widgetPlacement },
  );
  ctx.ui.setWorkingIndicator(workingIndicatorFrames());
  ctx.ui.setStatus("agentarium", formatStatus(state));
}

async function openAgentarium(ctx: ExtensionContext, state: AgentariumState, view: AgentariumView, demo = false): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("Agentarium requires interactive mode", "error");
    return;
  }

  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) => new AgentariumOverlay(tui, theme, state, view, demo, () => done()),
    {
      overlay: true,
      overlayOptions: {
        width: "82%",
        minWidth: 56,
        maxHeight: "100%",
        anchor: "center",
        margin: 0,
        visible: (termWidth, termHeight) => termWidth >= 60 && termHeight >= 18,
      },
    },
  );
}

export default function agentarium(pi: ExtensionAPI) {
  const state = new AgentariumState();
  const heartbeat = new HeartbeatStore(state);
  const gardenMemory = new GardenMemory(state);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let statusCtx: ExtensionContext | undefined;

  const refreshStatus = () => {
    if (!statusCtx?.hasUI) return;
    statusCtx.ui.setStatus("agentarium", state.config.enabled ? formatStatus(state) : undefined);
  };

  state.subscribe(refreshStatus);

  const scheduleSettle = () => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => state.setIdleIfSettled(), 9_000);
  };

  pi.registerFlag("agentarium", {
    description: "Enable Agentarium ambient agent habitat",
    type: "boolean",
    default: true,
  });

  pi.registerFlag("agentarium-view", {
    description: "Default Agentarium view: flowers, pond, constellation, or sand",
    type: "string",
    default: "flowers",
  });

  pi.on("session_start", async (_event, ctx) => {
    statusCtx = ctx;
    state.setContext(ctx, pi.getSessionName());
    const flagEnabled = pi.getFlag("agentarium");
    if (typeof flagEnabled === "boolean") state.setEnabled(flagEnabled);
    const flagView = normalizeView(String(pi.getFlag("agentarium-view") ?? "flowers"));
    if (flagView) state.setView(flagView);

    await cleanupStaleHeartbeats();
    await gardenMemory.start();
    await heartbeat.start();
    installWidget(ctx, state);
  });

  pi.on("model_select", (event, _ctx) => {
    state.setModel({ id: event.model.id, provider: event.model.provider });
  });

  pi.on("agent_start", (_event, _ctx) => {
    if (settleTimer) clearTimeout(settleTimer);
    state.onAgentStart();
    gardenMemory.add({ agentStarts: 1 });
  });

  pi.on("turn_start", (_event, _ctx) => {
    if (settleTimer) clearTimeout(settleTimer);
    state.onTurnStart();
    gardenMemory.add({ turns: 1 });
  });

  pi.on("tool_execution_start", (event, _ctx) => {
    if (settleTimer) clearTimeout(settleTimer);
    state.onToolStart(event.toolName);
    gardenMemory.add({ tools: 1 });
  });

  pi.on("tool_execution_end", (event, _ctx) => {
    state.onToolEnd(event.toolName, event.isError);
    if (event.isError) gardenMemory.add({ errors: 1 });
  });

  pi.on("agent_end", (_event, _ctx) => {
    state.onAgentEnd();
    gardenMemory.add({ completions: 1 });
    scheduleSettle();
  });

  pi.on("user_bash", (event, _ctx) => {
    state.onUserBash(event.command);
    gardenMemory.add({ userBash: 1 });
  });

  pi.on("session_shutdown", async (event, ctx) => {
    if (settleTimer) clearTimeout(settleTimer);
    if (ctx.hasUI) {
      ctx.ui.setWidget("agentarium", undefined);
      ctx.ui.setStatus("agentarium", undefined);
      ctx.ui.setWorkingIndicator();
    }
    await heartbeat.stop(event.reason === "quit");
    await gardenMemory.stop();
  });

  pi.registerCommand("agentarium", {
    description: "Open Agentarium — a calm ambient multi-agent habitat.",
    getArgumentCompletions(prefix: string): AutocompleteItem[] {
      const p = prefix.trim().toLowerCase();
      return COMMANDS.filter((item) => item.value.startsWith(p) || item.label.toLowerCase().startsWith(p));
    },
    handler: async (args, ctx) => {
      const [firstRaw, secondRaw] = args.trim().split(/\s+/);
      const first = firstRaw?.toLowerCase() ?? "";
      const second = secondRaw?.toLowerCase() ?? "";

      if (!first) {
        await openAgentarium(ctx, state, state.config.view);
        return;
      }

      if (first === "on" || first === "enable") {
        state.setEnabled(true);
        installWidget(ctx, state);
        ctx.ui.notify("Agentarium enabled", "info");
        return;
      }

      if (first === "off" || first === "disable") {
        state.setEnabled(false);
        installWidget(ctx, state);
        ctx.ui.notify("Agentarium ambient widget disabled. Use /agentarium on to restore it.", "info");
        return;
      }

      if (first === "above") {
        state.setPlacement("aboveEditor");
        installWidget(ctx, state);
        ctx.ui.notify("Agentarium widget moved above the editor", "info");
        return;
      }

      if (first === "below") {
        state.setPlacement("belowEditor");
        installWidget(ctx, state);
        ctx.ui.notify("Agentarium widget moved below the editor", "info");
        return;
      }

      if (first === "status") {
        ctx.ui.notify(formatStatus(state).replace(/\x1b\[[0-9;]*m/g, ""), "info");
        return;
      }

      if (first === "mode" || first === "set" || first === "widget") {
        const view = normalizeView(second);
        if (!view) {
          ctx.ui.notify("Usage: /agentarium mode [flowers|pond|constellation|sand]", "info");
          return;
        }
        state.setView(view);
        installWidget(ctx, state);
        ctx.ui.notify(`Agentarium bottom widget mode set to ${view}`, "info");
        return;
      }

      if (first === "demo") {
        await openAgentarium(ctx, state, state.config.view, true);
        return;
      }

      const view = normalizeView(first);
      if (view) {
        state.setView(view);
        await openAgentarium(ctx, state, view, first === "dashboard" ? false : false);
        return;
      }

      ctx.ui.notify("Usage: /agentarium [flowers|pond|constellation|sand|dashboard|demo|mode|on|off|above|below|status]", "info");
    },
  });

  pi.registerShortcut("ctrl+alt+z", {
    description: "Open Agentarium ambient overlay",
    handler: async (ctx) => {
      await openAgentarium(ctx, state, state.config.view);
    },
  });
}
