# Contributing to pi-agentarium

Thanks for helping improve Agentarium.

## Development

```bash
npm ci
npm run typecheck
npm pack --dry-run
```

Try the extension locally:

```bash
pi -e ./src/index.ts
```

Useful Pi commands while testing:

```text
/agentarium demo
/agentarium flowers
/agentarium pond
/agentarium constellation
/agentarium sand
/agentarium mode flowers
/agentarium mode pond
/agentarium mode constellation
/agentarium mode sand
```

## Design principles

- Calm, professional, terminal-friendly visuals.
- No sound by default.
- No auto-opening modal overlays.
- Avoid emoji-width-sensitive rendering.
- Keep the ambient widget lightweight and non-intrusive.

## Pull requests

Please include:

- a short description of the change
- screenshots or terminal recordings for visual changes when possible
- confirmation that `npm run typecheck` passes
