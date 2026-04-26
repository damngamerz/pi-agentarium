# pi-agentarium

> Ambient multi-agent observability for Pi — a calm terminal habitat for your coding agents.

`pi-agentarium` turns agent activity into a small living terminal habitat. It is not an arcade game and it is not a needy virtual pet: it is a low-noise, professional, hypnotic visualization layer for waiting on coding agents.

When Pi thinks, runs tools, or finishes a turn, the meadow blooms and the pond ripples. When several Pi sessions are running, each one becomes a plant, fish, star, or stone in the shared habitat.

## Demo

![Agentarium demo](https://raw.githubusercontent.com/damngamerz/pi-agentarium/main/assets/demo.gif)

The demo shows the ambient overlay cycling through flowers, pond, constellation, and sand modes.

- [Direct MP4 demo](https://raw.githubusercontent.com/damngamerz/pi-agentarium/main/assets/demo.mp4)
- The MP4 is also used as the Pi package gallery preview.

## Features

- **Ambient widget** below the editor while agents are active; hidden at startup and idle
- **Wildflower meadow** where agent usage grows healthier plants and attracts wildlife
- **Persistent garden memory** across Pi sessions via `~/.pi/agent/agentarium/garden-events.jsonl`
- **Koi pond overlay** with bubbles, ripples, and living agent fish
- **Constellation dashboard** for multi-agent workflows
- **Zen sand view** for a quieter screensaver feel
- **Multi-agent heartbeat** via `~/.pi/agent/agentarium/agents/*.json`
- **Low resource usage**: small timers, no heavy dependencies, no sound by default
- **Non-intrusive**: the widget does not capture keyboard input; overlay is opened manually

## Install

Install from GitHub:

```bash
pi install git:github.com/damngamerz/pi-agentarium
```

Or try it for one Pi run without installing:

```bash
pi -e git:github.com/damngamerz/pi-agentarium
```

Once published to npm, install with:

```bash
pi install npm:pi-agentarium
```

After installing globally, run `/reload` in Pi or restart Pi.

## Local development

```bash
npm ci
npm run typecheck
pi -e ./src/index.ts
```

## Commands

| Command | Description |
|---|---|
| `/agentarium` | Open the default overlay |
| `/agentarium flowers` | Open wildflower meadow view |
| `/agentarium jungle` | Alias for flowers, with terminal-friendly wildlife |
| `/agentarium pond` | Open koi pond view |
| `/agentarium constellation` | Open multi-agent constellation |
| `/agentarium dashboard` | Alias for constellation/dashboard view |
| `/agentarium sand` | Open zen sand view |
| `/agentarium demo` | Open with simulated agent activity |
| `/agentarium mode flowers` | Set the bottom widget mode without opening overlay |
| `/agentarium mode pond` | Set the bottom widget to pond |
| `/agentarium mode constellation` | Set the bottom widget to constellation / sky |
| `/agentarium mode sand` | Set the bottom widget to sand |
| `/agentarium on` | Enable ambient widget |
| `/agentarium off` | Disable ambient widget |
| `/agentarium above` | Put widget above editor |
| `/agentarium below` | Put widget below editor |
| `/agentarium status` | Show current status |

Shortcut:

```text
Ctrl+Alt+Z   open Agentarium overlay
```

Overlay controls:

```text
Tab          cycle modes
1 / f        flowers
2 / p        pond
3 / c        constellation / sky
4 / s        sand
Space        create bloom/ripple
D            toggle demo agents
R            refresh heartbeats
Q / Esc      close overlay
```

## CLI flags

```bash
pi --agentarium=false
pi --agentarium-view constellation
```

Views: `flowers`, `pond`, `constellation`, `sand`.

To set the ambient bottom widget without opening the overlay:

```text
/agentarium mode flowers
/agentarium mode pond
/agentarium mode constellation
/agentarium mode sand
```

## Design notes

Agentarium deliberately avoids noisy game mechanics:

- no XP bar by default
- no hunger meter
- no surprise sounds
- no auto-opening modal
- no high-cognitive-load puzzles

The goal is to make waiting feel calm while still conveying useful agent state.

## Persistence

Agentarium has two layers of state:

- **Live agent presence** is stored in `~/.pi/agent/agentarium/agents/*.json` and expires/removes when agents stop.
- **Garden health** is stored permanently in `~/.pi/agent/agentarium/garden-events.jsonl`.

That means the meadow can keep getting healthier across Pi sessions, projects, reloads, and restarts. Tool calls, turns, completions, user bash activity, and errors are appended as tiny JSONL events.

## What the visuals mean

| State | Visual |
|---|---|
| Idle | calm stem/fish/star/stone |
| Thinking | blue bud / gentle pulse |
| Tool running | golden flowers, bees, pollen, activity |
| Completed turn | green bloom/ripple |
| More agent usage | healthier meadow, more wildflowers and wildlife |
| Error | muted rose bloom/thorn/ripple |
| Multiple agents | multiple plants/fish/stars/stones |

## Package shape

```text
pi-agentarium/
  package.json
  src/
    index.ts
    state.ts
    heartbeat.ts
    garden-memory.ts
    types.ts
    ui/components.ts
```

## License

MIT
