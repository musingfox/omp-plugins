# omp-plugins

Native [oh-my-pi](https://github.com/can1357/oh-my-pi) marketplace. Skills/commands here target OMP primitives (`task`, `ask`, `hub`, `checkpoint`) — not Claude Code Agent Teams / Monitor / pi-dispatch.

Claude Code plugins live in [cc-plugins](https://github.com/musingfox/cc-plugins).

## Install (OMP)

```bash
omp plugin marketplace add git@github.com:musingfox/omp-plugins.git
omp plugin install cf@omp-plugins
omp plugin list
```

Reload plugins in-session: `/reload-plugins`.

## Plugins

| Name | Description |
|------|-------------|
| **cf** | `/cf <goal>` — research (scout) → plan → High-only `ask` → worktree shards → review |

## Develop locally

```bash
omp plugin link --local /path/to/omp-plugins/cf
```
