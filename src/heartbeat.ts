import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentRecord } from "./types.js";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TTL_MS } from "./types.js";
import type { AgentariumState } from "./state.js";

export const AGENTARIUM_DIR = join(homedir(), ".pi", "agent", "agentarium");
export const HEARTBEAT_DIR = join(AGENTARIUM_DIR, "agents");

export class HeartbeatStore {
  private timer: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: (() => void) | undefined;
  private writing = false;
  private pending = false;
  readonly file = join(HEARTBEAT_DIR, `${process.pid}.json`);

  constructor(private state: AgentariumState) {}

  async start(): Promise<void> {
    await mkdir(HEARTBEAT_DIR, { recursive: true });
    this.unsubscribe?.();
    this.unsubscribe = this.state.subscribe(() => void this.writeSoon());
    await this.writeSoon();
    this.timer ??= setInterval(() => void this.writeSoon(), HEARTBEAT_INTERVAL_MS);
  }

  async stop(removeFile = true): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (removeFile) {
      await rm(this.file, { force: true }).catch(() => undefined);
    }
  }

  async writeSoon(): Promise<void> {
    if (this.writing) {
      this.pending = true;
      return;
    }
    this.writing = true;
    try {
      await mkdir(HEARTBEAT_DIR, { recursive: true });
      const tmp = `${this.file}.${Date.now()}.tmp`;
      const payload = JSON.stringify(this.state.toRecord(), null, 2);
      await writeFile(tmp, payload, "utf8");
      await rename(tmp, this.file);
    } catch {
      // Heartbeats are best-effort; never disturb the agent workflow.
    } finally {
      this.writing = false;
      if (this.pending) {
        this.pending = false;
        void this.writeSoon();
      }
    }
  }
}

export async function readAgentRecords(now = Date.now(), includeStale = false): Promise<AgentRecord[]> {
  let files: string[];
  try {
    files = await readdir(HEARTBEAT_DIR);
  } catch {
    return [];
  }

  const records: AgentRecord[] = [];
  await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        try {
          const raw = await readFile(join(HEARTBEAT_DIR, file), "utf8");
          const record = JSON.parse(raw) as AgentRecord;
          if (!record || typeof record.pid !== "number" || typeof record.updatedAt !== "number") return;
          if (!includeStale && now - record.updatedAt > HEARTBEAT_TTL_MS) return;
          records.push(record);
        } catch {
          // Ignore half-written/corrupt heartbeat files.
        }
      }),
  );

  return records.sort((a, b) => {
    const phaseWeight = (phase: AgentRecord["phase"]): number => {
      switch (phase) {
        case "tool":
          return 0;
        case "thinking":
          return 1;
        case "error":
          return 2;
        case "done":
          return 3;
        case "idle":
          return 4;
      }
    };
    return phaseWeight(a.phase) - phaseWeight(b.phase) || b.updatedAt - a.updatedAt;
  });
}

export async function cleanupStaleHeartbeats(now = Date.now()): Promise<void> {
  let files: string[];
  try {
    files = await readdir(HEARTBEAT_DIR);
  } catch {
    return;
  }

  await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        const path = join(HEARTBEAT_DIR, file);
        try {
          const raw = await readFile(path, "utf8");
          const record = JSON.parse(raw) as AgentRecord;
          if (record.updatedAt && now - record.updatedAt > HEARTBEAT_TTL_MS * 4) {
            await rm(path, { force: true });
          }
        } catch {
          await rm(path, { force: true }).catch(() => undefined);
        }
      }),
  );
}
