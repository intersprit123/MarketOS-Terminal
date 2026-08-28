# MarketOS-Terminal

Local-first control center for the MarketOS / CodeX project.

## Quick start (Windows)

```powershell
git clone https://github.com/intersprit123/MarketOS-Terminal
cd MarketOS-Terminal
npm install
$env:MARKETOS_DIR="D:\ESHHAN\My ShareMarket APP\CodeX"
npm start
```

If `MARKETOS_DIR` is not set, the terminal looks for `CodeX` beside the terminal repository.

## Commands

- `status` — process, port and safe configuration status
- `start` — start `npm run dev`
- `stop` — stop only the tracked MarketOS process
- `restart` — restart MarketOS
- `hot-restart` — clear `.next` and restart
- `refresh` — fast-forward `git pull`
- `build` — run the production build
- `market` — call `/api/market` and summarize the response
- `health` — test the app and market API
- `quota` — show safe provider/cache configuration
- `cache` — clear `.next`
- `logs` — show terminal events
- `doctor` — diagnose common setup problems
- `path` — show the configured project path
- `clear` — clear the terminal
- `exit` — quit

## Security

The terminal never prints the contents of `GROQ_API_KEY` or `TWELVE_DATA_API_KEY`. It reports only whether a key is configured. It also refuses to kill an unknown process occupying port 3000; `stop` only kills the process started and tracked by this terminal.

## Market-data safety

The MarketOS application is responsible for its own Twelve Data caching/rate-limit logic. The terminal does not make repeated background market requests. The `market` command performs a single explicit local API check when you ask for it.
