# omp-plugins

Native [oh-my-pi](https://github.com/can1357/oh-my-pi) plugins. Skills/commands target OMP primitives (`task`, `ask`, `hub`, `checkpoint`).

Each plugin is an OMP package: `package.json` with `"omp": {}`, plus conventional `commands/` and `skills/`. There is no marketplace catalog and no `.claude-plugin/` layout.

Claude Code ports live in [cc-plugins](https://github.com/musingfox/cc-plugins).

## Install

```bash
omp plugin link --local /path/to/omp-plugins/cf
omp plugin link --local /path/to/omp-plugins/viz
omp plugin link --local /path/to/omp-plugins/obw
omp plugin link --local /path/to/obsidian-skills   # after adding package.json with "omp": {}
omp plugin list
omp plugin doctor
```

Reload in-session: `/reload-plugins`.

`obw` depends on kepano's [obsidian-skills](https://github.com/kepano/obsidian-skills) (`obsidian-cli` and related skills). That repo is third-party; native loading is a local `package.json` + `link`.

## Plugins

| Name | Slash commands | Description |
|------|----------------|-------------|
| **cf** | `/cf <goal>` | research → plan → High-only `ask` → worktree shards → review |
| **viz** | skills `viz-inline`, `viz-render` | chat shapes and browser HTML |
| **obw** | `/obw-init`, `/obw-jot`, `/obw-pm` | Obsidian vault productivity |
| **obsidian** (kepano) | skills `obsidian-cli`, `obsidian-markdown`, `obsidian-bases`, `json-canvas`, `defuddle` | vault I/O syntax for `obw` |

Slash names are markdown filenames; skill names are skill directory names. OMP does not namespace as `plugin:name`.

## Develop locally

```bash
omp plugin link --local /path/to/omp-plugins/cf
```
