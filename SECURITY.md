# Security Policy

Pi extensions run with local user privileges and can observe agent lifecycle events. Treat any extension package as executable code.

## Supported versions

The latest published version is supported.

## Reporting a vulnerability

Please report security issues privately by opening a GitHub security advisory or contacting the maintainer through GitHub:

https://github.com/damngamerz/pi-agentarium/security/advisories

Please do not disclose vulnerabilities publicly until they have been reviewed.

## Data written by Agentarium

Agentarium writes local state under:

```text
~/.pi/agent/agentarium/
```

This includes live heartbeat files and append-only garden memory events. It does not intentionally send telemetry or network requests.
