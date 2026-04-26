import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENTARIUM_DIR } from "./heartbeat.js";
import type { AgentariumConfig, AgentariumView } from "./types.js";

const CONFIG_FILE = join(AGENTARIUM_DIR, "config.json");
const VIEWS = new Set<AgentariumView>(["flowers", "pond", "constellation", "sand"]);
const PLACEMENTS = new Set<AgentariumConfig["widgetPlacement"]>(["aboveEditor", "belowEditor"]);

interface StoredAgentariumConfig {
  version: 1;
  enabled?: boolean;
  view?: AgentariumView;
  widgetPlacement?: AgentariumConfig["widgetPlacement"];
}

function parseStoredConfig(value: unknown): Partial<AgentariumConfig> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Partial<StoredAgentariumConfig>;
  const config: Partial<AgentariumConfig> = {};

  if (typeof raw.enabled === "boolean") config.enabled = raw.enabled;
  if (raw.view && VIEWS.has(raw.view)) config.view = raw.view;
  if (raw.widgetPlacement && PLACEMENTS.has(raw.widgetPlacement)) config.widgetPlacement = raw.widgetPlacement;

  return config;
}

export async function loadAgentariumConfig(): Promise<Partial<AgentariumConfig>> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return parseStoredConfig(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function saveAgentariumConfig(config: AgentariumConfig): Promise<void> {
  try {
    await mkdir(AGENTARIUM_DIR, { recursive: true });
    const payload: StoredAgentariumConfig = {
      version: 1,
      enabled: config.enabled,
      view: config.view,
      widgetPlacement: config.widgetPlacement,
    };
    const tmp = `${CONFIG_FILE}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await rename(tmp, CONFIG_FILE);
  } catch {
    // Config persistence is convenience-only; never disturb the agent workflow.
  }
}
