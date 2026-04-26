import { basename } from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AgentariumConfig, AgentariumPulse, AgentPhase, AgentRecord, GardenStats, PulseType } from "./types.js";
import { createEmptyGardenStats, DEFAULT_CONFIG } from "./types.js";

function projectFromCwd(cwd: string): string {
  const base = basename(cwd || process.cwd());
  return base || cwd || "pi";
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shortLabel(record: Pick<AgentRecord, "sessionName" | "project" | "cwd">, max = 18): string {
  const raw = record.sessionName?.trim() || record.project || projectFromCwd(record.cwd);
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(1, max - 1))}…`;
}

export class AgentariumState {
  readonly startedAt = Date.now();
  readonly pid = process.pid;

  config: AgentariumConfig = { ...DEFAULT_CONFIG };
  cwd = process.cwd();
  project = projectFromCwd(this.cwd);
  sessionName: string | undefined;
  model: string | undefined;
  provider: string | undefined;

  phase: AgentPhase = "idle";
  currentTool: string | undefined;
  lastEvent = "resting";
  turnCount = 0;
  toolCount = 0;
  errorCount = 0;
  updatedAt = Date.now();
  private gardenStats: GardenStats = createEmptyGardenStats();

  private pulseId = 0;
  private activeTools = 0;
  private busy = false;
  private subscribers = new Set<() => void>();
  private pulses: AgentariumPulse[] = [];

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.touch();
  }

  setView(view: AgentariumConfig["view"]): void {
    this.config.view = view;
    this.touch();
  }

  setPlacement(placement: AgentariumConfig["widgetPlacement"]): void {
    this.config.widgetPlacement = placement;
    this.touch();
  }

  setContext(ctx: ExtensionContext, sessionName?: string): void {
    this.cwd = ctx.cwd;
    this.project = projectFromCwd(ctx.cwd);
    this.sessionName = sessionName;
    this.model = ctx.model?.id;
    this.provider = ctx.model?.provider;
    this.touch(false);
  }

  setSessionName(sessionName: string | undefined): void {
    this.sessionName = sessionName;
    this.touch();
  }

  setModel(model: { id: string; provider: string } | undefined): void {
    this.model = model?.id;
    this.provider = model?.provider;
    this.touch();
  }

  setGardenStats(stats: GardenStats): void {
    this.gardenStats = stats;
    this.touch();
  }

  getGardenStats(): GardenStats {
    return this.gardenStats;
  }

  onAgentStart(): void {
    this.busy = true;
    this.phase = "thinking";
    this.currentTool = undefined;
    this.lastEvent = "agent thinking";
    this.pushPulse("start", "start");
    this.touch();
  }

  onTurnStart(): void {
    this.turnCount++;
    this.busy = true;
    if (this.activeTools === 0) this.phase = "thinking";
    this.lastEvent = `turn ${this.turnCount}`;
    this.touch();
  }

  onToolStart(toolName: string): void {
    this.activeTools++;
    this.busy = true;
    this.phase = "tool";
    this.currentTool = toolName;
    this.toolCount++;
    this.lastEvent = `${toolName} running`;
    this.pushPulse("tool", toolName);
    this.touch();
  }

  onToolEnd(toolName: string, isError: boolean): void {
    this.activeTools = Math.max(0, this.activeTools - 1);
    if (isError) {
      this.errorCount++;
      this.phase = "error";
      this.lastEvent = `${toolName} errored`;
      this.pushPulse("error", toolName);
    } else {
      this.lastEvent = `${toolName} complete`;
      this.pushPulse("success", toolName);
      this.phase = this.activeTools > 0 ? "tool" : "thinking";
    }
    if (this.activeTools === 0) this.currentTool = undefined;
    this.touch();
  }

  onAgentEnd(): void {
    this.busy = false;
    this.activeTools = 0;
    this.currentTool = undefined;
    this.phase = this.phase === "error" ? "error" : "done";
    this.lastEvent = this.phase === "error" ? "finished with issues" : "turn complete";
    this.pushPulse(this.phase === "error" ? "error" : "finish", "done");
    this.touch();
  }

  onUserBash(command: string): void {
    const label = command.trim().split(/\s+/).slice(0, 3).join(" ");
    this.lastEvent = label ? `user: ${label}` : "user bash";
    this.pushPulse("manual", label || "bash");
    this.touch();
  }

  setIdleIfSettled(): void {
    if (this.busy || this.activeTools > 0) return;
    if (this.phase === "done" || this.phase === "error") {
      this.phase = "idle";
      this.currentTool = undefined;
      this.lastEvent = "resting";
      this.touch();
    }
  }

  pushManualPulse(label = "ripple"): void {
    this.pushPulse("manual", label);
    this.touch();
  }

  getPulses(now = Date.now()): AgentariumPulse[] {
    this.pulses = this.pulses.filter((pulse) => now - pulse.createdAt < 9_000);
    return [...this.pulses];
  }

  toRecord(now = Date.now()): AgentRecord {
    return {
      pid: this.pid,
      cwd: this.cwd,
      project: this.project,
      sessionName: this.sessionName,
      model: this.model,
      provider: this.provider,
      phase: this.phase,
      currentTool: this.currentTool,
      lastEvent: this.lastEvent,
      turnCount: this.turnCount,
      toolCount: this.toolCount,
      errorCount: this.errorCount,
      startedAt: this.startedAt,
      updatedAt: now,
    };
  }

  shouldShowWidget(records: readonly Pick<AgentRecord, "phase">[], now = Date.now()): boolean {
    if (!this.config.enabled) return false;

    // Do not show at Pi startup just because idle heartbeat files exist.
    // The widget is ambient activity feedback, so it appears only while an
    // agent is actively thinking/tooling, plus a brief local completion tail.
    if (records.some((record) => record.phase === "tool" || record.phase === "thinking")) return true;
    if ((this.phase === "done" || this.phase === "error") && now - this.updatedAt < 9_000) return true;
    return false;
  }

  private pushPulse(type: PulseType, label?: string): void {
    const seed = hashString(`${this.pid}:${this.pulseId}:${type}:${label ?? ""}:${Date.now()}`);
    this.pulses.push({
      id: ++this.pulseId,
      type,
      label,
      createdAt: Date.now(),
      seed,
    });
    if (this.pulses.length > 48) this.pulses.splice(0, this.pulses.length - 48);
  }

  private touch(notify = true): void {
    this.updatedAt = Date.now();
    if (!notify) return;
    for (const fn of this.subscribers) fn();
  }
}
