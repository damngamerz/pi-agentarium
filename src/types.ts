export type AgentPhase = "idle" | "thinking" | "tool" | "done" | "error";

export type AgentariumView = "flowers" | "pond" | "constellation" | "sand";

export type PulseType = "start" | "tool" | "success" | "error" | "finish" | "manual";

export interface AgentariumPulse {
  id: number;
  type: PulseType;
  label?: string;
  createdAt: number;
  seed: number;
}

export interface AgentariumConfig {
  enabled: boolean;
  view: AgentariumView;
  widgetPlacement: "aboveEditor" | "belowEditor";
}

export interface GardenStats {
  totalAgentStarts: number;
  totalTurns: number;
  totalTools: number;
  totalCompletions: number;
  totalErrors: number;
  totalUserBash: number;
  firstSeenAt: number;
  updatedAt: number;
}

export interface GardenDelta {
  agentStarts?: number;
  turns?: number;
  tools?: number;
  completions?: number;
  errors?: number;
  userBash?: number;
}

export function createEmptyGardenStats(now = Date.now()): GardenStats {
  return {
    totalAgentStarts: 0,
    totalTurns: 0,
    totalTools: 0,
    totalCompletions: 0,
    totalErrors: 0,
    totalUserBash: 0,
    firstSeenAt: now,
    updatedAt: now,
  };
}

export interface AgentRecord {
  pid: number;
  cwd: string;
  project: string;
  sessionName?: string;
  model?: string;
  provider?: string;
  phase: AgentPhase;
  currentTool?: string;
  lastEvent: string;
  turnCount: number;
  toolCount: number;
  errorCount: number;
  startedAt: number;
  updatedAt: number;
}

export interface AgentariumSnapshot {
  local: AgentRecord;
  pulses: AgentariumPulse[];
}

export const HEARTBEAT_TTL_MS = 18_000;
export const HEARTBEAT_INTERVAL_MS = 2_000;

export const DEFAULT_CONFIG: AgentariumConfig = {
  enabled: true,
  view: "flowers",
  widgetPlacement: "belowEditor",
};
