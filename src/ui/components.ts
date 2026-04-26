import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, KeyId, TUI } from "@mariozechner/pi-tui";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { readAgentRecords } from "../heartbeat.js";
import { hashString, shortLabel, type AgentariumState } from "../state.js";
import type { AgentariumPulse, AgentariumView, AgentPhase, AgentRecord, GardenStats } from "../types.js";

const RESET_FG = "\x1b[39m";
const RESET = "\x1b[0m";

function rgb(r: number, g: number, b: number, text: string): string {
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET_FG}`;
}

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

function italic(text: string): string {
  return `\x1b[3m${text}\x1b[23m`;
}

const water = {
  ink: (s: string) => rgb(104, 158, 190, s),
  dim: (s: string) => rgb(74, 105, 130, s),
  deep: (s: string) => rgb(45, 75, 105, s),
  glow: (s: string) => rgb(131, 214, 255, s),
  teal: (s: string) => rgb(122, 232, 210, s),
  leaf: (s: string) => rgb(145, 225, 168, s),
  gold: (s: string) => rgb(255, 210, 128, s),
  rose: (s: string) => rgb(255, 128, 148, s),
  violet: (s: string) => rgb(185, 160, 255, s),
  sand: (s: string) => rgb(181, 165, 133, s),
  sandDim: (s: string) => rgb(119, 108, 89, s),
};

function phaseGlyph(phase: AgentPhase): string {
  switch (phase) {
    case "idle":
      return "·";
    case "thinking":
      return "◦";
    case "tool":
      return "◆";
    case "done":
      return "✿";
    case "error":
      return "✕";
  }
}

function phaseText(phase: AgentPhase): string {
  switch (phase) {
    case "idle":
      return water.dim("resting pond");
    case "thinking":
      return water.glow("thinking");
    case "tool":
      return water.gold("tooling");
    case "done":
      return water.leaf("complete");
    case "error":
      return water.rose("needs attention");
  }
}

function phaseStyle(phase: AgentPhase): (s: string) => string {
  switch (phase) {
    case "idle":
      return water.dim;
    case "thinking":
      return water.glow;
    case "tool":
      return water.gold;
    case "done":
      return water.leaf;
    case "error":
      return water.rose;
  }
}

function fit(text: string, width: number): string {
  if (width <= 0) return "";
  const truncated = truncateToWidth(text, width, "");
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function center(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "");
  const left = Math.floor(Math.max(0, width - visibleWidth(clipped)) / 2);
  return fit(`${" ".repeat(left)}${clipped}`, width);
}

const VIEW_CHOICES: Array<{ view: AgentariumView; number: KeyId; key: KeyId; label: string }> = [
  { view: "flowers", number: "1", key: "f", label: "flowers" },
  { view: "pond", number: "2", key: "p", label: "pond" },
  { view: "constellation", number: "3", key: "c", label: "sky" },
  { view: "sand", number: "4", key: "s", label: "sand" },
];

function inputMatches(data: string, ...keys: KeyId[]): boolean {
  return keys.some((key) => data === key || data === key.toUpperCase() || matchesKey(data, key));
}

function viewFromInput(data: string): AgentariumView | undefined {
  for (const choice of VIEW_CHOICES) {
    if (inputMatches(data, choice.number, choice.key)) return choice.view;
  }
  return undefined;
}

function nextView(view: AgentariumView): AgentariumView {
  const index = VIEW_CHOICES.findIndex((choice) => choice.view === view);
  return VIEW_CHOICES[(index + 1) % VIEW_CHOICES.length]?.view ?? "flowers";
}

function viewLabel(view: AgentariumView): string {
  return VIEW_CHOICES.find((choice) => choice.view === view)?.label ?? view;
}

function renderModeBar(activeView: AgentariumView, width: number): string {
  const prefix = water.dim("mode ");
  const items = VIEW_CHOICES.map((choice) => {
    const text = `${choice.number} ${choice.label}`;
    return choice.view === activeView ? water.glow(bold(`[${text}]`)) : water.dim(` ${text} `);
  });
  return fit(prefix + items.join(water.deep(" · ")), width);
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function createCanvas(width: number, height: number): string[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => " "));
}

function place(canvas: string[][], x: number, y: number, text: string, style?: (s: string) => string): void {
  if (y < 0 || y >= canvas.length) return;
  const row = canvas[y];
  if (!row) return;
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const xx = x + i;
    if (xx < 0 || xx >= row.length) continue;
    const ch = chars[i] ?? "";
    row[xx] = style && ch !== " " ? style(ch) : ch;
  }
}

function lineBetween(canvas: string[][], x0: number, y0: number, x1: number, y1: number, char: string, style: (s: string) => string): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  if (steps <= 0) return;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    place(canvas, x, y, char, style);
  }
}

function renderCanvas(canvas: string[][], width: number): string[] {
  return canvas.map((row) => fit(row.join(""), width));
}

function fillWater(canvas: string[][], frame: number, compact = false): void {
  const height = canvas.length;
  const width = canvas[0]?.length ?? 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wave = Math.sin((x + frame * 0.55) / 8 + y * 1.7) + Math.sin((x - frame * 0.21) / 17 - y * 0.9);
      const sparkle = hashString(`${Math.floor(frame / 5)}:${x}:${y}`) % (compact ? 83 : 47);
      if (sparkle === 0) canvas[y][x] = water.glow("◦");
      else if (sparkle === 1) canvas[y][x] = water.dim("·");
      else if (Math.abs(wave) < 0.045 && (x + y + Math.floor(frame / 3)) % 3 === 0) canvas[y][x] = water.deep("~");
    }
  }
}

function pulsePosition(pulse: AgentariumPulse, width: number, height: number): { x: number; y: number } {
  return {
    x: pulse.seed % Math.max(1, width),
    y: (pulse.seed >>> 8) % Math.max(1, height),
  };
}

function renderPulses(canvas: string[][], pulses: AgentariumPulse[], now: number): void {
  const height = canvas.length;
  const width = canvas[0]?.length ?? 0;
  if (!height || !width) return;

  for (const pulse of pulses) {
    const age = now - pulse.createdAt;
    const life = pulse.type === "error" ? 7_500 : 6_000;
    if (age < 0 || age > life) continue;
    const t = age / life;
    const radius = Math.max(1, Math.floor(t * Math.min(12, Math.max(3, Math.min(width, height) / 2))));
    const { x, y } = pulsePosition(pulse, width, height);
    const style = pulse.type === "error" ? water.rose : pulse.type === "finish" ? water.leaf : pulse.type === "tool" ? water.gold : water.teal;
    const char = pulse.type === "error" ? "×" : pulse.type === "finish" ? "✧" : radius % 2 === 0 ? "≈" : "~";
    const points = Math.max(8, radius * 4);
    for (let i = 0; i < points; i++) {
      const angle = (Math.PI * 2 * i) / points;
      const xx = Math.round(x + Math.cos(angle) * radius * 1.8);
      const yy = Math.round(y + Math.sin(angle) * radius * 0.55);
      place(canvas, xx, yy, char, style);
    }
  }
}

function renderAmbientLife(canvas: string[][], frame: number, intensity: number): void {
  const height = canvas.length;
  const width = canvas[0]?.length ?? 0;
  if (!height || !width) return;

  const count = Math.max(2, Math.min(7, Math.floor(width / 22) + Math.floor(height / 7) + intensity));
  const silhouettes = ["><(((º>", "<º)))><", "⋘⋙", "‹((·)", "(·))›"];

  for (let i = 0; i < count; i++) {
    const seed = hashString(`ambient:${i}:${width}:${height}`);
    const dir = seed % 2 === 0 ? 1 : -1;
    const fish = silhouettes[(seed >>> 3) % silhouettes.length] ?? "><(((º>";
    const sprite = dir > 0 ? fish : fish.split("").reverse().join("");
    const lane = 1 + ((seed >>> 7) % Math.max(1, height - 2));
    const speed = 0.035 + ((seed >>> 11) % 40) / 1400;
    const sway = Math.round(Math.sin(frame / 15 + i) * Math.min(2, Math.max(1, Math.floor(height / 8))));
    const x = Math.floor(mod(seed + dir * frame * speed, width + sprite.length * 2) - sprite.length);
    const style = i % 3 === 0 ? water.deep : i % 3 === 1 ? water.dim : water.ink;
    place(canvas, x, Math.max(0, Math.min(height - 1, lane + sway)), sprite, style);
  }

  // Gentle lotus/firefly accents so an idle pond still feels alive without faking agent activity.
  const blooms = Math.max(1, Math.min(4, Math.floor(width / 36)));
  for (let i = 0; i < blooms; i++) {
    const seed = hashString(`bloom:${i}:${width}`);
    const x = 2 + (seed % Math.max(1, width - 4));
    const y = Math.max(0, Math.min(height - 1, 1 + ((seed >>> 8) % Math.max(1, height - 2))));
    const phase = Math.floor(frame / 12 + i) % 4;
    const glyph = phase === 0 ? "✧" : phase === 1 ? "✿" : phase === 2 ? "·" : " ";
    if (glyph !== " ") place(canvas, x, y, glyph, phase === 1 ? water.leaf : water.teal);
  }
}

function mergeRecords(records: AgentRecord[], local: AgentRecord): AgentRecord[] {
  const map = new Map<number, AgentRecord>();
  for (const record of records) map.set(record.pid, record);
  map.set(local.pid, local);
  return [...map.values()].sort((a, b) => {
    if (a.pid === local.pid) return -1;
    if (b.pid === local.pid) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

function createDemoRecords(frame: number, local: AgentRecord): AgentRecord[] {
  const names = ["auth-refactor", "test-runner", "docs-scribe", "reviewer", "ui-polish", "release-watch", "perf-scout"];
  const tools = ["bash", "read", "grep", "edit", "test", "build", "review"];
  const phases: AgentPhase[] = ["thinking", "tool", "tool", "idle", "done", "thinking", "error"];
  const tick = Math.floor(frame / 28);
  return names.map((name, index) => {
    const phase = phases[(tick + index) % phases.length] ?? "idle";
    return {
      ...local,
      pid: 90_000 + index,
      project: name,
      sessionName: name,
      phase,
      currentTool: phase === "tool" ? tools[(tick + index) % tools.length] : undefined,
      lastEvent: phase === "tool" ? `${tools[(tick + index) % tools.length]} running` : phase,
      turnCount: local.turnCount + index * 2,
      toolCount: local.toolCount + index * 7,
      errorCount: phase === "error" ? 1 : 0,
      updatedAt: Date.now() - index * 900,
    } satisfies AgentRecord;
  });
}

function renderPondScene(
  records: AgentRecord[],
  pulses: AgentariumPulse[],
  width: number,
  height: number,
  frame: number,
  compact = false,
): string[] {
  const canvas = createCanvas(width, height);
  fillWater(canvas, frame, compact);
  renderAmbientLife(canvas, frame, records.some((record) => record.phase === "tool" || record.phase === "thinking") ? 1 : 0);
  renderPulses(canvas, pulses, Date.now());

  const maxAgents = Math.min(records.length, compact ? 4 : Math.max(1, height + 4));
  for (let i = 0; i < maxAgents; i++) {
    const record = records[i]!;
    const seed = hashString(`${record.pid}:${record.cwd}:${record.project}`);
    const dir = seed % 2 === 0 ? 1 : -1;
    const fish = dir > 0 ? "><(((º>" : "<º)))><";
    const fishWidth = fish.length;
    const lane = Math.max(1, height - 1);
    const y = compact ? i % Math.max(1, height) : 1 + ((seed >>> 5) % Math.max(1, lane - 1));
    const activity = record.phase === "tool" ? 0.19 : record.phase === "thinking" ? 0.12 : record.phase === "error" ? 0.025 : 0.055;
    const drift = dir * frame * activity;
    const x = Math.floor(mod(seed + drift, width + fishWidth * 2) - fishWidth);
    const style = phaseStyle(record.phase);
    place(canvas, x, y, fish, style);

    if (record.phase === "tool") {
      for (let b = 0; b < 3; b++) {
        const bx = x + 2 + ((seed >>> (b + 2)) % Math.max(1, fishWidth));
        const by = y - 1 - ((frame + b * 3 + seed) % Math.max(1, Math.min(3, y + 1)));
        place(canvas, bx, by, b % 2 === 0 ? "◦" : "·", water.gold);
      }
    }

    if (!compact && width > 52 && i < Math.floor(height / 2)) {
      const label = `${phaseGlyph(record.phase)} ${shortLabel(record, 14)}${record.currentTool ? ` · ${record.currentTool}` : ""}`;
      const labelY = Math.min(height - 1, y + 1);
      place(canvas, Math.max(0, Math.min(width - visibleWidth(label), x)), labelY, label, record.phase === "idle" ? water.dim : style);
    }
  }

  return renderCanvas(canvas, width);
}

function renderConstellationScene(records: AgentRecord[], width: number, height: number, frame: number, compact = false): string[] {
  const canvas = createCanvas(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const star = hashString(`star:${Math.floor(frame / 18)}:${x}:${y}`) % 97;
      if (star === 0) canvas[y][x] = water.dim("·");
      if (star === 1 && width > 60) canvas[y][x] = water.deep("˙");
    }
  }

  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  place(canvas, cx - 1, cy, "✺", water.violet);
  if (!compact) place(canvas, cx + 1, cy, "main", water.dim);

  const visibleRecords = records.slice(0, compact ? 5 : records.length);
  const count = Math.max(1, visibleRecords.length);
  const rx = compact ? Math.max(6, Math.floor(width * 0.38)) : Math.max(8, Math.floor(width * 0.34));
  const ry = compact ? Math.max(1, Math.floor(height * 0.35)) : Math.max(3, Math.floor(height * 0.33));
  for (let i = 0; i < visibleRecords.length; i++) {
    const record = visibleRecords[i]!;
    const seed = hashString(`${record.pid}:${record.project}`);
    const angle = (Math.PI * 2 * i) / count + (seed % 100) / 900 + frame / 900;
    const x = Math.round(cx + Math.cos(angle) * rx);
    const y = Math.round(cy + Math.sin(angle) * ry);
    lineBetween(canvas, cx, cy, x, y, record.phase === "tool" ? "•" : "·", record.phase === "tool" ? water.gold : water.deep);
    const style = phaseStyle(record.phase);
    const glyph = record.phase === "tool" ? "◆" : record.phase === "error" ? "✕" : record.phase === "done" ? "✦" : "✧";
    place(canvas, x, y, glyph, style);
    if (!compact) {
      const label = shortLabel(record, 13);
      const labelX = x < cx ? x - label.length - 2 : x + 2;
      place(canvas, Math.max(0, Math.min(width - label.length, labelX)), y, label, style);
    }
  }

  return renderCanvas(canvas, width);
}

function renderSandScene(records: AgentRecord[], pulses: AgentariumPulse[], width: number, height: number, frame: number, compact = false): string[] {
  const canvas = createCanvas(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wave = Math.sin(x / 8 + y * 0.9 + frame / 38) + Math.sin(x / 17 - y * 1.3 - frame / 70);
      if (Math.abs(wave) < 0.07) canvas[y][x] = water.sandDim("─");
      else if (Math.abs(wave) < 0.12 && x % 2 === 0) canvas[y][x] = water.sandDim("·");
      else if (hashString(`sand:${Math.floor(frame / 20)}:${x}:${y}`) % 131 === 0) canvas[y][x] = water.sandDim("˙");
    }
  }

  renderPulses(canvas, pulses, Date.now());

  const stones = records.slice(0, Math.min(records.length, compact ? 4 : 8));
  for (let i = 0; i < stones.length; i++) {
    const record = stones[i]!;
    const seed = hashString(`${record.pid}:${record.project}:stone`);
    const x = 4 + (seed % Math.max(1, width - 8));
    const y = compact ? ((seed >>> 9) % Math.max(1, height)) : 2 + ((seed >>> 9) % Math.max(1, height - 4));
    place(canvas, x, y, record.phase === "error" ? "◆" : record.phase === "tool" ? "◉" : "●", phaseStyle(record.phase));
    if (!compact && width > 54) place(canvas, x + 2, y, shortLabel(record, 12), record.phase === "idle" ? water.dim : phaseStyle(record.phase));
  }

  return renderCanvas(canvas, width);
}

function gardenHealth(records: AgentRecord[], global?: GardenStats): number {
  const totals = records.reduce(
    (acc, record) => {
      acc.turns += record.turnCount;
      acc.tools += record.toolCount;
      acc.errors += record.errorCount;
      if (record.phase === "tool" || record.phase === "thinking") acc.active++;
      if (record.phase === "done") acc.done++;
      return acc;
    },
    { turns: 0, tools: 0, errors: 0, active: 0, done: 0 },
  );

  const globalGrowth = global
    ? global.totalTools * 0.38 + global.totalTurns * 1.8 + global.totalCompletions * 2.2 + global.totalUserBash * 0.5
    : 0;
  const globalStress = global ? Math.min(24, global.totalErrors * 1.4) : 0;
  const liveGrowth = totals.tools * 1.1 + totals.turns * 2.3 + totals.active * 7 + totals.done * 4;
  const liveStress = Math.min(22, totals.errors * 11);
  const raw = 32 + Math.min(58, globalGrowth + liveGrowth) - Math.max(globalStress, liveStress);
  return Math.max(8, Math.min(100, Math.round(raw)));
}

function healthWord(health: number): string {
  if (health >= 86) return "blooming";
  if (health >= 66) return "flourishing";
  if (health >= 42) return "growing";
  return "recovering";
}

function healthMeter(health: number, cells = 8): string {
  const filled = Math.max(0, Math.min(cells, Math.round((health / 100) * cells)));
  return `[${"█".repeat(filled)}${"░".repeat(cells - filled)}]`;
}

function renderCanopyVines(canvas: string[][], health: number, frame: number, compact: boolean): void {
  if (compact || health < 58) return;
  const height = canvas.length;
  const width = canvas[0]?.length ?? 0;
  if (height < 9 || width < 48) return;

  const vineCount = Math.min(6, Math.max(1, Math.floor((health - 50) / 10)));
  for (let i = 0; i < vineCount; i++) {
    const seed = hashString(`canopy:${i}:${width}:${height}`);
    const rootX = 4 + (seed % Math.max(1, width - 8));
    const length = 3 + ((seed >>> 8) % Math.max(2, Math.min(7, height - 4)));
    place(canvas, rootX - 1, 0, "╭╮", water.deep);
    for (let y = 1; y <= length; y++) {
      const x = rootX + Math.round(Math.sin(frame / 18 + y * 0.8 + i) * 1.5);
      place(canvas, x, y, y % 2 === 0 ? "╎" : "│", water.leaf);
      if ((y + seed) % 3 === 0) place(canvas, x + 1, y, "❧", water.leaf);
      if ((y + seed) % 4 === 0) place(canvas, x - 1, y, "❦", water.dim);
    }
  }
}

function renderWildlife(canvas: string[][], records: AgentRecord[], health: number, frame: number, compact: boolean): void {
  const height = canvas.length;
  const width = canvas[0]?.length ?? 0;
  if (!height || !width) return;

  const active = records.some((record) => record.phase === "tool" || record.phase === "thinking");
  const seedBase = records.map((record) => `${record.pid}:${record.toolCount}:${record.errorCount}`).join("|") || "agentarium";

  // Bees are text, not emoji, because simple glyphs survive more terminals.
  const beeCount = health > 24 ? Math.min(compact ? 2 : 7, Math.floor(health / 20) + (active ? 1 : 0)) : 0;
  for (let i = 0; i < beeCount; i++) {
    const seed = hashString(`bee:${seedBase}:${i}`);
    const orbit = frame / (5.5 + (seed % 4)) + i * 1.7;
    const x = Math.round(width * 0.14 + (seed % Math.max(1, Math.floor(width * 0.72))) + Math.sin(orbit) * 4);
    const y = Math.round(1 + ((seed >>> 8) % Math.max(1, height - 3)) + Math.cos(orbit * 1.3) * 1.3);
    place(canvas, x, y, frame % 8 < 4 ? "bzz" : "bz·", active ? water.gold : water.sand);
  }

  const butterflyCount = health > 52 && !compact ? Math.min(4, Math.floor((health - 45) / 12)) : 0;
  for (let i = 0; i < butterflyCount; i++) {
    const seed = hashString(`butterfly:${seedBase}:${i}`);
    const drift = frame / (18 + (seed % 9));
    const x = Math.round(3 + (seed % Math.max(1, width - 8)) + Math.sin(drift) * 5);
    const y = Math.round(1 + ((seed >>> 10) % Math.max(1, Math.floor(height * 0.55))) + Math.cos(drift * 1.7) * 2);
    place(canvas, x, y, frame % 10 < 5 ? "ʚɞ" : "ɞʚ", i % 2 === 0 ? water.violet : water.teal);
  }

  const birdCount = health > 68 && !compact ? Math.min(5, Math.floor((health - 58) / 10)) : 0;
  for (let i = 0; i < birdCount; i++) {
    const seed = hashString(`bird:${seedBase}:${i}`);
    const x = Math.round(mod(seed + frame * (0.12 + i * 0.02), width + 8) - 4);
    const y = Math.max(0, Math.min(height - 1, 1 + ((seed >>> 12) % Math.max(1, Math.floor(height / 3)))));
    place(canvas, x, y, frame % 12 < 6 ? "⌁" : "⌒", water.dim);
  }

  // A tiny terminal monkey: it only appears once the meadow is genuinely healthy.
  if (health > 78 && !compact && height > 10 && width > 58) {
    const monkeyX = Math.round(width * 0.72 + Math.sin(frame / 16) * 4);
    const monkeyY = Math.max(2, Math.floor(height * 0.48));
    place(canvas, monkeyX - 1, monkeyY, "╭╮", water.leaf);
    place(canvas, monkeyX - 1, monkeyY + 1, "(@)", water.gold);
    place(canvas, monkeyX, monkeyY + 2, "╰╯", water.leaf);
  }
}

function renderFlowerScene(
  records: AgentRecord[],
  pulses: AgentariumPulse[],
  width: number,
  height: number,
  frame: number,
  compact = false,
  global?: GardenStats,
): string[] {
  const canvas = createCanvas(width, height);
  const groundY = Math.max(0, height - 1);
  const health = gardenHealth(records, global);

  // Soft meadow background: small fireflies and pollen. Avoid emoji; these glyphs are stable in terminals.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const density = Math.max(31, (compact ? 125 : 80) - Math.floor(health / 2));
      const drift = hashString(`pollen:${Math.floor(frame / 10)}:${x}:${y}`) % density;
      if (drift === 0) canvas[y][x] = health > 58 ? water.teal("·") : water.deep("·");
      else if (drift === 1 && !compact) canvas[y][x] = water.dim("˙");
    }
  }

  for (let x = 0; x < width; x++) {
    const wave = Math.sin((x + frame / 2) / 9);
    canvas[groundY][x] = Math.abs(wave) < 0.15 ? water.leaf("╱") : x % 2 === 0 ? water.deep("─") : water.dim("─");
  }

  renderCanopyVines(canvas, health, frame, compact);

  // Healthy meadows get background wildflowers, so agent usage has visible cumulative payoff.
  const wildflowers = Math.max(0, Math.min(compact ? 8 : 28, Math.floor((health - 35) / 3)));
  const wildGlyphs = ["✿", "✽", "❀", "✾", "·"];
  for (let i = 0; i < wildflowers; i++) {
    const seed = hashString(`wildflower:${i}:${width}:${height}`);
    const x = 1 + (seed % Math.max(1, width - 2));
    const y = Math.max(0, groundY - 1 - ((seed >>> 8) % Math.max(1, Math.min(4, height - 1))));
    const glyph = wildGlyphs[(seed + Math.floor(frame / 19)) % wildGlyphs.length]!;
    place(canvas, x, y, glyph, i % 3 === 0 ? water.violet : i % 3 === 1 ? water.leaf : water.teal);
  }

  renderPulses(canvas, pulses, Date.now());

  const maxPlants = compact ? Math.min(3, records.length) : Math.min(records.length, Math.max(1, Math.floor(width / 15)));
  const spacing = width / Math.max(1, maxPlants + 1);
  const flowerGlyphs = ["✿", "❀", "✽", "✾", "❁"];
  const budGlyphs = ["✦", "✧", "✣", "✤"];

  for (let i = 0; i < maxPlants; i++) {
    const record = records[i]!;
    const seed = hashString(`${record.pid}:${record.cwd}:${record.project}:flower`);
    const baseX = Math.max(2, Math.min(width - 3, Math.round((i + 1) * spacing + (((seed >>> 5) % 5) - 2))));
    const lifetimeGrowth = global
      ? Math.floor(Math.sqrt(global.totalTools + global.totalTurns * 3 + global.totalCompletions * 5 + global.totalUserBash))
      : 0;
    const energy = lifetimeGrowth + record.turnCount * 2 + record.toolCount + (record.phase === "tool" ? 10 : 0) + (record.phase === "thinking" ? 5 : 0);
    const growth = Math.max(3, Math.min(height - 3, 3 + Math.floor(Math.sqrt(Math.max(1, energy)))));
    const topY = Math.max(0, groundY - growth);
    const style = phaseStyle(record.phase);
    const flower =
      record.phase === "error"
        ? "✕"
        : record.phase === "tool"
          ? flowerGlyphs[(seed + Math.floor(frame / 7)) % flowerGlyphs.length]!
          : record.phase === "thinking"
            ? budGlyphs[(seed + Math.floor(frame / 9)) % budGlyphs.length]!
            : record.phase === "done"
              ? flowerGlyphs[(seed >>> 9) % flowerGlyphs.length]!
              : "✽";

    let lastX = baseX;
    for (let y = groundY - 1; y >= topY; y--) {
      const depth = groundY - y;
      const swayAmount = record.phase === "tool" || record.phase === "thinking" ? 1.25 : 0.65;
      const sway = Math.round(Math.sin(frame / 12 + depth * 0.9 + i) * swayAmount * (depth / Math.max(1, growth)));
      const x = Math.max(0, Math.min(width - 1, baseX + sway));
      const stem = x > lastX ? "╲" : x < lastX ? "╱" : "│";
      place(canvas, x, y, stem, record.phase === "idle" ? water.deep : water.leaf);
      lastX = x;

      if (depth > 1 && depth < growth - 1 && (depth + seed) % 3 === 0) {
        const side = (depth + seed) % 2 === 0 ? -1 : 1;
        place(canvas, x + side, y, side < 0 ? "❦" : "❧", record.phase === "idle" ? water.dim : water.leaf);
      }

      if (!compact && record.phase === "tool" && depth % 4 === 0) {
        place(canvas, x + 2, y - 1, "˙", water.gold);
      }
    }

    place(canvas, lastX, topY, flower, style);
    if (!compact && record.phase !== "idle") {
      place(canvas, lastX - 1, Math.max(0, topY - 1), "✧", record.phase === "error" ? water.rose : water.gold);
      place(canvas, lastX + 2, Math.max(0, topY), "·", style);
    }

    if (!compact && width > 50) {
      const label = `${phaseGlyph(record.phase)} ${shortLabel(record, 13)}${record.currentTool ? ` · ${record.currentTool}` : ""}`;
      place(canvas, Math.max(0, Math.min(width - visibleWidth(label), baseX - Math.floor(visibleWidth(label) / 2))), groundY, label, record.phase === "idle" ? water.dim : style);
    }
  }

  renderWildlife(canvas, records, health, frame, compact);

  if (!compact && width > 44 && height > 6) {
    const label = `meadow ${healthWord(health)} ${healthMeter(health)} ${health}%`;
    place(canvas, 2, 0, label, health > 70 ? water.leaf : health > 42 ? water.gold : water.sand);
  }

  return renderCanvas(canvas, width);
}

function renderAgentariumScene(
  view: AgentariumView,
  records: AgentRecord[],
  pulses: AgentariumPulse[],
  width: number,
  height: number,
  frame: number,
  compact: boolean,
  global?: GardenStats,
): string[] {
  if (view === "flowers") return renderFlowerScene(records, pulses, width, height, frame, compact, global);
  if (view === "pond") return renderPondScene(records, pulses, width, height, frame, compact);
  if (view === "constellation") return renderConstellationScene(records, width, height, frame, compact);
  return renderSandScene(records, pulses, width, height, frame, compact);
}

function renderSummary(records: AgentRecord[], width: number): string[] {
  if (records.length === 0) return [fit(water.dim("awaiting live agents"), width)];
  const lines: string[] = [];
  const chunks = records.slice(0, 8).map((record) => {
    const status = record.currentTool ?? record.phase;
    return `${phaseStyle(record.phase)(phaseGlyph(record.phase))} ${water.ink(shortLabel(record, 12))} ${water.dim(status)}`;
  });
  let line = "";
  for (const chunk of chunks) {
    const next = line ? `${line}   ${chunk}` : chunk;
    if (visibleWidth(next) > width && line) {
      lines.push(fit(line, width));
      line = chunk;
    } else {
      line = next;
    }
  }
  if (line) lines.push(fit(line, width));
  return lines.slice(0, 3);
}

export class AgentariumWidget implements Component {
  private frame = 0;
  private records: AgentRecord[] = [];
  private tickTimer: ReturnType<typeof setInterval>;
  private readTimer: ReturnType<typeof setInterval>;
  private unsubscribe: () => void;
  private reading = false;

  constructor(
    private tui: Pick<TUI, "requestRender">,
    private theme: Theme,
    private state: AgentariumState,
  ) {
    this.unsubscribe = this.state.subscribe(() => this.tui.requestRender());
    this.tickTimer = setInterval(() => {
      this.frame++;
      this.tui.requestRender();
    }, 220);
    this.readTimer = setInterval(() => void this.refreshRecords(), 1_400);
    void this.refreshRecords();
  }

  render(width: number): string[] {
    const local = this.state.toRecord();
    const records = mergeRecords(this.records, local);
    if (!this.state.shouldShowWidget(records)) return [];
    if (width < 28) return [fit(`${water.teal("◦")} ${water.ink("Agentarium")} ${phaseText(local.phase)}`, width)];

    const active = records.filter((record) => record.phase !== "idle").length;
    const view = this.state.config.view;
    const health = gardenHealth(records, this.state.getGardenStats());
    const healthText = view === "flowers" ? ` · meadow ${healthWord(health)} ${health}%` : "";
    const title = `${water.teal("◦")} ${bold(water.glow("Agentarium"))} ${water.dim("—")} ${water.ink(viewLabel(view))} ${water.dim("·")} ${phaseText(local.phase)} ${water.dim(`· ${records.length} live · ${active} active${healthText}`)} ${water.dim("·")} ${water.ink(local.lastEvent)}`;
    const miniHeight = width > 80 || view === "constellation" || view === "sand" ? 3 : 2;
    const scene = renderAgentariumScene(view, records, this.state.getPulses(), width, miniHeight, this.frame, true, this.state.getGardenStats());
    return [fit(title, width), ...scene];
  }

  invalidate(): void {
    this.tui.requestRender();
  }

  dispose(): void {
    clearInterval(this.tickTimer);
    clearInterval(this.readTimer);
    this.unsubscribe();
  }

  private async refreshRecords(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    try {
      this.records = await readAgentRecords();
      this.tui.requestRender();
    } finally {
      this.reading = false;
    }
  }
}

export class AgentariumOverlay implements Component {
  private frame = 0;
  private records: AgentRecord[] = [];
  private tickTimer: ReturnType<typeof setInterval>;
  private readTimer: ReturnType<typeof setInterval>;
  private reading = false;

  constructor(
    private tui: Pick<TUI, "requestRender">,
    private theme: Theme,
    private state: AgentariumState,
    private view: AgentariumView,
    private demo: boolean,
    private done: () => void,
  ) {
    this.tickTimer = setInterval(() => {
      this.frame++;
      this.tui.requestRender();
    }, 95);
    this.readTimer = setInterval(() => void this.refreshRecords(), 1_250);
    void this.refreshRecords();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      this.dispose();
      this.done();
      return;
    }
    if (matchesKey(data, Key.tab)) {
      this.view = nextView(this.view);
      this.state.setView(this.view);
      this.tui.requestRender();
      return;
    }

    const selectedView = viewFromInput(data);
    if (selectedView) {
      this.view = selectedView;
      this.state.setView(this.view);
      this.tui.requestRender();
      return;
    }

    if (inputMatches(data, "d")) this.demo = !this.demo;
    else if (data === " " || matchesKey(data, Key.space)) this.state.pushManualPulse("bloom");
    else if (inputMatches(data, "r")) void this.refreshRecords();
    this.state.setView(this.view);
    this.tui.requestRender();
  }

  render(width: number): string[] {
    if (width < 42) {
      return [
        fit(water.glow("Agentarium"), width),
        fit(water.dim("Terminal too narrow for the pond."), width),
        fit(water.dim("q close"), width),
      ];
    }

    const local = this.state.toRecord();
    const records = this.demo ? createDemoRecords(this.frame, local) : mergeRecords(this.records, local);
    const inner = Math.max(10, width - 2);
    const sceneHeight = Math.max(7, Math.min(12, Math.floor(width / 7)));
    const border = (s: string) => water.deep(s);
    const row = (content: string) => `${border("│")}${fit(content, inner)}${border("│")}`;

    const viewName = this.view === "flowers" ? "wildflower meadow" : this.view === "pond" ? "koi pond" : this.view === "constellation" ? "constellation" : "sand";
    const title = `${bold(water.glow("Agentarium"))} ${water.dim("—")} ${water.ink(viewName)} ${this.demo ? water.gold(" demo") : ""}`;
    const health = gardenHealth(records, this.state.getGardenStats());
    const subtitle = this.view === "flowers"
      ? `${water.dim("living agent meadow")} ${water.dim("·")} ${records.length} live ${records.length === 1 ? "agent" : "agents"} ${water.dim("·")} meadow ${healthWord(health)} ${health}%`
      : `${water.dim("ambient multi-agent observability")} ${water.dim("·")} ${records.length} live ${records.length === 1 ? "agent" : "agents"}`;

    const lines: string[] = [];
    lines.push(border(`╭${"─".repeat(inner)}╮`));
    lines.push(row(center(title, inner)));
    lines.push(row(center(subtitle, inner)));
    lines.push(border(`├${"─".repeat(inner)}┤`));

    const scene = renderAgentariumScene(this.view, records, this.state.getPulses(), inner, sceneHeight, this.frame, false, this.state.getGardenStats());

    for (const sceneLine of scene) lines.push(row(sceneLine));
    lines.push(border(`├${"─".repeat(inner)}┤`));
    for (const summaryLine of renderSummary(records, inner).slice(0, 1)) lines.push(row(summaryLine));
    lines.push(row(renderModeBar(this.view, inner)));
    lines.push(
      row(
        `${water.dim("tab")} cycle  ${water.dim("space")} bloom  ${water.dim("d")} demo  ${water.dim("r")} refresh  ${water.dim("q/esc")} close`,
      ),
    );
    lines.push(border(`╰${"─".repeat(inner)}╯`));
    return lines.map((line) => fit(line, width));
  }

  invalidate(): void {
    this.tui.requestRender();
  }

  dispose(): void {
    clearInterval(this.tickTimer);
    clearInterval(this.readTimer);
  }

  private async refreshRecords(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    try {
      this.records = await readAgentRecords();
      this.tui.requestRender();
    } finally {
      this.reading = false;
    }
  }
}

export function workingIndicatorFrames(): { frames: string[]; intervalMs: number } {
  return {
    frames: [
      water.deep("·"),
      water.dim("◦"),
      water.ink("○"),
      water.glow("◉"),
      water.ink("○"),
      water.dim("◦"),
    ],
    intervalMs: 140,
  };
}

export function formatStatus(state: AgentariumState): string {
  const record = state.toRecord();
  const bits = [`${viewLabel(state.config.view)} mode`, `${phaseGlyph(record.phase)} ${record.phase}`];
  if (record.currentTool) bits.push(record.currentTool);
  if (record.toolCount) bits.push(`${record.toolCount} tools`);
  if (record.errorCount) bits.push(`${record.errorCount} issues`);
  return `${water.glow("Agentarium")} ${water.dim(bits.join(" · "))}`;
}

export function stripAnsiForTests(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "").replace(new RegExp(RESET, "g"), "");
}
