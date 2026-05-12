# Security

We take security seriously. AIIA Console handles API keys, runs IPC between
a JavaScript frontend and a Rust backend, and is a local-first app that ships
to user machines. Bugs in any of those surfaces can cause real harm, so we
want to hear about them quickly and quietly.

## Reporting a vulnerability

**Email `eric@lovold.com` privately.** Please do **not** open a public issue
for a security bug.

We aim to acknowledge new reports within **7 days** and to ship a fix or a
clear plan within **30 days** for any confirmed vulnerability.

When you report, please include:

- A description of the vulnerability and its impact
- Steps to reproduce (a minimal example is great)
- The version / commit SHA you tested against
- Any suggested mitigation (optional)

If your report is in scope and material, we'll credit you publicly when the
fix ships, unless you ask us not to.

## In scope

- The Tauri desktop app (`src-tauri/`) — IPC handlers, command surface, file
  system access, sidecar process management.
- The keystore implementation (`src-tauri/src/`) — anything that touches API
  keys at rest or in flight.
- The provider abstraction (`src/providers/`) — any code path that could
  cause a key to be logged, serialized, or exposed to the JavaScript layer.
- The Vault read/write surface — path traversal, accidental writes outside
  the sandbox.
- Build / supply chain — package-lock or Cargo.lock anomalies, suspicious new
  dependencies, anything that could ship malicious code via an upgrade.

## Out of scope

- Vulnerabilities in third-party providers' APIs (Anthropic, OpenAI, Google,
  DeepSeek, Moonshot). Report those to the vendor directly.
- Vulnerabilities in [Ollama](https://github.com/ollama/ollama) itself.
  Report at <https://github.com/ollama/ollama/security>.
- Vulnerabilities in the [AIIA Brain](https://github.com/ericlovo/AIIA) HTTP
  surface. Report at <https://github.com/ericlovo/AIIA/security>.
- Issues that require an attacker to already have code execution on the
  user's machine.
- Issues in dependencies that are already publicly known and being tracked
  upstream (please link the upstream advisory and we'll prioritize the bump).

## Our commitments

- **API keys never reach the JavaScript layer.** Remote provider keys are
  loaded inside Rust (`keystore_call`), used to construct request headers
  or query params, and applied to a `reqwest` client. The response stream
  contains only the upstream provider's body bytes — never the key.
- **Keystore at rest:** `~/.aiia/` is created with mode `0700`,
  `~/.aiia/keys.json` with mode `0600`. Verified on every write.
- **All remote provider calls are proxied through the Rust keystore.** The
  JS layer cannot make outbound API calls with a key on its own.
- **No telemetry.** We don't collect usage data, crash reports, or model
  output. Ever.
- **No auto-update at this stage.** Updates are explicit — you choose when
  to upgrade.
- **No analytics, no accounts, no servers we run.** Console is a pure desktop
  app talking to your machine and to providers you opt into.

## Coordinated disclosure

If you'd like to publish your own writeup about a vulnerability you found,
we're happy to coordinate timing so that a fix ships before public disclosure.
Email us and we'll work out a date together.
