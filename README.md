# omp-plugins

Native [oh-my-pi](https://github.com/can1357/oh-my-pi) plugins. Skills/commands target OMP primitives (`task`, `ask`, `hub`, `checkpoint`).

Each plugin is an OMP package: `package.json` with `"omp": {}`, plus conventional `commands/` and `skills/`. There is no marketplace catalog and no `.claude-plugin/` layout.

`obw` also has a Pi extension for task browsing, persistent binding, work-start recording, and explicit reply sync. Its OMP skills are not Pi prompts; OMP writeback and full cross-host acceptance remain incomplete. See [OBW host support and acceptance](obw/README.md).

Claude Code ports live in [cc-plugins](https://github.com/musingfox/cc-plugins).

## Install

```bash
omp plugin link --local /path/to/omp-plugins/viz
omp plugin link --local /path/to/omp-plugins/obw
omp plugin link --local /path/to/omp-plugins/spec
omp plugin link --local /path/to/omp-plugins/diagnose
omp plugin link --local /path/to/omp-plugins/deepen
omp plugin link --local /path/to/omp-plugins/adr
omp plugin link --local /path/to/omp-plugins/agent-browser
omp plugin link --local /path/to/omp-plugins/apple-podcasts
omp plugin link --local /path/to/omp-plugins/hook-guard
omp plugin link --local /path/to/omp-plugins/wizard
omp plugin link --local /path/to/omp-plugins/zen-agent
omp plugin link --local /path/to/omp-plugins/audit
omp plugin link --local /path/to/obsidian-skills   # after adding package.json with "omp": {}
omp plugin list
omp plugin doctor
```

Reload in-session: `/reload-plugins`.

`obw` depends on kepano's [obsidian-skills](https://github.com/kepano/obsidian-skills) (`obsidian-cli` and related skills). That repo is third-party; native loading is a local `package.json` + `link`.

## Plugins

| Name | Slash commands | Description |
|------|----------------|-------------|
| **viz** | `/viz-inline`, `/viz-render` | chat shapes and browser HTML |
| **obw** | `/issue`; Pi: `/obw-bind`, `/obw-unbind`, `/obw-sync`; OMP skills: `/obw-init`, `/obw-jot`, `/obw-pm` | Obsidian tasks; Pi-first writeback, OMP browsing/skills |
| **spec** | — | Architecture contracts and domain glossary |
| **diagnose** | `/diagnose-now` | Evidence-only bug diagnosis and main-session handoff |
| **deepen** | — | Architecture survey from user scope or git hotspots |
| **adr** | — | Repository ADR lifecycle and consistency audits |
| **agent-browser** | — | agent-browser, Playwright, and web-test workflows |
| **apple-podcasts** | — | Apple Podcasts episode audio URL resolution |
| **hook-guard** | `/hook-guard` | Guided Git hook setup and commit checks |
| **wizard** | — | Human-operated setup and credential wizards |
| **zen-agent** | — | Visible second Zen browser the user can watch and take over |
| **audit** | — | Docs and milestone-test audits |
| **obsidian** (kepano) | skills `obsidian-cli`, `obsidian-markdown`, `obsidian-bases`, `json-canvas`, `defuddle` | vault I/O syntax for `obw` |

Markdown slash names are filenames; extensions may also register commands. Skill names are skill directory names. OMP does not namespace as `plugin:name`.

## Develop locally

```bash
omp plugin link --local /path/to/omp-plugins/viz
```