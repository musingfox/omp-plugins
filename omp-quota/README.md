# omp-quota

Shows every omp provider's remaining quota inside an OMP or Pi session, as one widget
above the prompt (an OMP extension, `index.ts`, with the same behavior as a Pi
extension, `pi.ts`; both share the pure core `usage.ts`/`quota-model.ts`/`controller.ts`).

- **`/quota`**: toggles a compact table above the prompt, one line per provider.
- **`/quota refresh`**: drops omp's cache and fetches fresh quota, without a model turn.
- **Notice**: one in-session notification when a provider's status worsens from `ok`.

Built against OMP 18.18.6 and Pi 1.5.0. Both entries only use the official extension
surface: `registerCommand`, `setWidget`, `notify`, `exec`, `appendEntry`, `session_start`,
`session_shutdown`.

## How omp is run

Each fetch runs `omp usage --json` with a 30-second limit. The OMP adapter
uses the current OMP environment. The Pi adapter removes `PI_CODING_AGENT_DIR` from
the child environment so a Pi-specific session directory cannot become omp's data
source; `HOME` and any OMP profile selection remain unchanged. With `HOME` unset the
extension reports an unavailable source rather than guessing an account.

An enabled interactive widget fetches immediately and then every five minutes.
Hiding it, replacing the session/controller, or shutdown cancels the poll. Disabled
widgets and headless startup do not poll. Manual refresh remains available, and a
failed fetch is visible without erasing the last good data. Late results cannot
redraw a shut-down controller.

Background polls do not block model turns. Enabling a widget starts its fetch
without awaiting it; only explicit refresh commands wait for their CLI result.

## How quota is read

- **Remaining share** of a limit: omp's `remainingFraction` when it is a number, else
  `1 − usedFraction`, else none; clamped to 0–100%. A provider's share is the lowest of its
  limits' shares. Shown as a rounded percentage, or `—` when none is computable.
- **Status** of a provider: the worst status among its limits (`exhausted` > `warning` >
  `ok`); limits without one are ignored, and a provider with none has no status. Reports
  with the same provider name merge into one provider; a report without one is listed as
  `(unnamed)`.
- **Worsened provider**: one whose status was `ok` in the previous good fetch and is
  `warning` or `exhausted` now. The first good fetch has no previous; `warning` →
  `exhausted`, a provider without a status on either side, and a newly appearing provider
  do not count.
- **Failed fetch**: omp did not answer (could not start, or still running after 30 s),
  exited non-zero, printed something that is not a JSON report list, or reported no
  providers — the last is how omp answers when it reads the wrong home, so it never wipes
  the display. omp's error output is never shown.
- **Account data**: only provider names, limit ids and labels, shares, statuses, and reset
  times are kept. omp's `metadata` (email, account id, endpoint) and each limit's `scope`
  never reach a notice, the transcript, or the widget.

## The notice

When a good fetch finds providers that worsened since the previous good fetch, one
in-session notification names them all:
`omp quota: openai-codex now warning, anthropic now exhausted`. Failed fetches in between
do not reset the comparison. A recovery re-arms the notice: the next worsening counts
again. There is no OS notification; a worsening that happens while you are in another
window shows in the widget, if it is on, when you return.

## Commands

- `/quota` toggles the widget above the prompt on or off and prints nothing in the
  transcript. Only this command changes the widget — a poll or a worsening never does. The
  choice is kept as a `custom` session entry (type `omp-quota-band`) on the active branch
  and restored at session start, so the widget stays as you left it; with nothing recorded,
  it starts off. Entry-based state survives branch, tree, and reload exactly as the
  session does; there is no other disk store.
- `/quota refresh` runs `omp usage invalidate`, then fetches, and answers one line:
  `omp quota refreshed` or `omp quota refresh failed: <reason>` (the widget then shows the
  failure in its notice line). When the invalidate fails, the fetch still runs and the
  answer ends in `(cache not invalidated)`. It does not change the widget and needs no
  model turn.
- `/quota <anything else>` answers `usage: /quota [refresh]` and runs nothing.

Outside TUI mode no poll is started. An explicit `/quota` returns provider lines on
stderr without changing the saved toggle; `/quota refresh` returns its receipt.
Neither command needs a model turn.

## The widget

The widget is the strip above the prompt input. While `/quota` has it on, it shows a
notice line while fetching (`Fetching omp usage`), when no fetch has succeeded
(`Unavailable: <reason>`), or when the latest fetch failed
(`Stale: <reason>; showing data from <age> ago`). Then one line per provider that reports
limits, from the least share left to the most, for example:

```
cursor              Monthly   0% 11h 25m exhausted
openai-codex        5 hours 100% 4h 59m  7 days    6% 1d 11h warning
anthropic           5 Hour   86% 1h 44m  7 Day    94% 5d 15h
```

Each line holds one cell per window (omp's window label, or the limit label when it has
none), soonest reset first: `<window> <share> <time to reset>`, plus the window's status
only when it is `warning` or `exhausted`. A window's share and reset come from its limit
with the least share left (the first one when none has a share), so repeated pools such as
antigravity's shared Claude & GPT limits collapse into one cell. Cells are padded so the
windows line up across providers. A provider's order uses its lowest share across all
limits; providers without a share go last, and one reporting no limits (such as
`ollama-cloud`) is left out. Time to reset reads `Xd Yh`, `Xh Ym`, or `Ym`, `now` when due,
and `—` when omp gives none.

The widget redraws after every settled fetch, failed ones included, so it always shows the
latest data the extension holds. It is plain text (the official `setWidget` string-array
form), so it works on both hosts without component code.

## Install

```bash
omp plugin link --local /path/to/omp-plugins/omp-quota
```

For Pi, add the package's `pi.ts` through the host's own extension loading (Pi 1.5.0).
Pi is local to this machine's install; OMP is the primary host.

## Tests

```bash
cd omp-quota && bun test tests/
```

The test kit is hermetic: no network, no real omp; every exec a test makes is answered by
a stub. `tests/snapshot.ts` is a redacted copy of a live `omp usage --json` taken on
2026-09-18; `tests/account-data.ts` fails any test that would commit an account key or an
email into the fixture.
