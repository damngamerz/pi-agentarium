import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENTARIUM_DIR } from "./heartbeat.js";
import type { AgentariumState } from "./state.js";
import type { GardenDelta, GardenStats } from "./types.js";
import { createEmptyGardenStats } from "./types.js";

const GARDEN_EVENTS_FILE = join(AGENTARIUM_DIR, "garden-events.jsonl");

interface GardenEvent {
  at: number;
  pid: number;
  cwd: string;
  project: string;
  delta: GardenDelta;
}

function applyDelta(stats: GardenStats, delta: GardenDelta, at = Date.now()): GardenStats {
  return {
    totalAgentStarts: stats.totalAgentStarts + (delta.agentStarts ?? 0),
    totalTurns: stats.totalTurns + (delta.turns ?? 0),
    totalTools: stats.totalTools + (delta.tools ?? 0),
    totalCompletions: stats.totalCompletions + (delta.completions ?? 0),
    totalErrors: stats.totalErrors + (delta.errors ?? 0),
    totalUserBash: stats.totalUserBash + (delta.userBash ?? 0),
    firstSeenAt: Math.min(stats.firstSeenAt, at),
    updatedAt: Math.max(stats.updatedAt, at),
  };
}

async function readStatsFromLog(): Promise<GardenStats> {
  const now = Date.now();
  let stats = createEmptyGardenStats(now);
  let raw = "";
  try {
    raw = await readFile(GARDEN_EVENTS_FILE, "utf8");
  } catch {
    return stats;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as Partial<GardenEvent>;
      if (!event.delta || typeof event.at !== "number") continue;
      stats = applyDelta(stats, event.delta, event.at);
    } catch {
      // Ignore partial/corrupt lines. The next append remains valid JSONL.
    }
  }
  return stats;
}

export class GardenMemory {
  private stats: GardenStats = createEmptyGardenStats();
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private writing = Promise.resolve();

  constructor(private state: AgentariumState) {}

  async start(): Promise<void> {
    await mkdir(AGENTARIUM_DIR, { recursive: true });
    await this.refresh();
    this.refreshTimer ??= setInterval(() => void this.refresh(), 10_000);
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
    await this.writing.catch(() => undefined);
  }

  async refresh(): Promise<void> {
    this.stats = await readStatsFromLog();
    this.state.setGardenStats(this.stats);
  }

  add(delta: GardenDelta): void {
    const at = Date.now();
    const record = this.state.toRecord(at);
    const event: GardenEvent = {
      at,
      pid: process.pid,
      cwd: record.cwd,
      project: record.project,
      delta,
    };

    this.stats = applyDelta(this.stats, delta, at);
    this.state.setGardenStats(this.stats);

    this.writing = this.writing
      .then(async () => {
        await mkdir(AGENTARIUM_DIR, { recursive: true });
        await appendFile(GARDEN_EVENTS_FILE, `${JSON.stringify(event)}\n`, "utf8");
      })
      .catch(() => undefined);
  }
}
