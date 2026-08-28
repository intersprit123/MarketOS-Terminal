# MarketOS Terminal

Local-first operator console for the MarketOS / CodeX development project.

## Quick start

```powershell
git clone https://github.com/intersprit123/MarketOS-Terminal.git
cd MarketOS-Terminal
npm install
$env:MARKETOS_DIR="D:\ESHHAN\My ShareMarket APP\CodeX"
npm start
```

By default the terminal looks for the sibling `CodeX` folder.

## Commands

`status` `start` `stop` `restart` `hot-restart` `build` `refresh` `pull` `sync`

`market` `stock <symbol>` `search <query>` `screen` `ai <question>` `health` `doctor`

`config` `quota` `env` `path` `set-path <path>` `set-port <port>` `open [path]` `url [path]` `port`

`cache` `clean` `backup` `recent` `logs` `git-status` `git-branch` `git-log` `npm-install` `typecheck` `verify`

`info` `files` `version` `clear` `help` `exit`

## Safety

- API key values are never printed.
- `stop` only terminates the process tracked by this terminal.
- An unrelated process already listening on the configured port is left untouched.
- `market` performs a single explicit API request; there is no polling loop.
- The terminal is a local development controller, not a trading execution system.

## Configuration

Optional environment variables:

- `MARKETOS_DIR` — path to the MarketOS CodeX project.
- `MARKETOS_PORT` — local port, default `3000`.

MarketOS owns `GROQ_API_KEY` and `TWELVE_DATA_API_KEY` in its own `.env.local`. This terminal checks only whether those settings are configured and never displays their values.
