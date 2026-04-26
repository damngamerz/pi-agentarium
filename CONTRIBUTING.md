# Contributing

Thank you for your interest in contributing to **pi-agentarium**. Contributions of all sizes are welcome: bug reports, documentation fixes, design feedback, accessibility improvements, tests, and code changes.

## Code of conduct

Please be respectful and constructive. Assume good intent, avoid personal attacks, and keep discussions focused on improving the project.

## How to contribute

### Report a bug

When opening an issue, please include:

- what you expected to happen
- what actually happened
- steps to reproduce the issue
- your terminal/OS environment when relevant
- screenshots or recordings for visual/TUI issues, if possible

### Request a feature

Feature requests are welcome. Please describe:

- the problem or workflow the feature would improve
- the proposed behavior
- any alternatives you considered

### Submit a pull request

1. Fork the repository.
2. Create a branch from `main`.
3. Make your changes.
4. Run the validation commands below.
5. Open a pull request with a clear summary.

Please keep pull requests focused. Smaller PRs are easier to review and merge.

## Development setup

```bash
git clone git@github.com:damngamerz/pi-agentarium.git
cd pi-agentarium
npm ci
npm run typecheck
```

Try the extension locally:

```bash
pi -e ./src/index.ts
```

Useful commands while testing:

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

## Validation

Before opening a PR, run:

```bash
npm run typecheck
npm pack --dry-run
```

If your change affects Pi extension loading, also test:

```bash
pi --list-models __agentarium_load_probe__
```

## Style guidelines

- Keep the extension lightweight and dependency-minimal.
- Prefer readable TypeScript over clever abstractions.
- Avoid committing generated files, local config, logs, or `node_modules`.
- Keep terminal rendering width-safe and friendly to tmux/SSH environments.
- Avoid emoji for core UI elements unless there is a stable fallback.
- Do not add sounds, auto-opening modals, or intrusive behavior by default.

## Visual changes

For UI, ASCII art, animation, or color changes, please include a screenshot, terminal recording, or a short description of the before/after behavior.

Agentarium aims to be calm, professional, and non-intrusive. Visual changes should preserve that tone.

## Documentation changes

Documentation improvements are always welcome. Please keep examples current with the implemented commands and defaults.

## Security

Do not open public issues for security vulnerabilities. See [SECURITY.md](./SECURITY.md) for reporting instructions.

## License

By contributing to this repository, you agree that your contributions will be licensed under the project’s [MIT License](./LICENSE).
