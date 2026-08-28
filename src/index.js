#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_MARKETOS = process.env.MARKETOS_DIR || resolve(ROOT, '..', 'CodeX')
const PORT = Number(process.env.MARKETOS_PORT || 3000)
let child = null
let childStartedAt = null
const events = []

function out(msg = '') { process.stdout.write(`${msg}\n`) }
function logEvent(message) {
  events.push(`[${new Date().toLocaleTimeString()}] ${message}`)
  if (events.length > 100) events.shift()
}
function banner() {
  out('\n╭────────────────────────────────────────────╮')
  out('│           MARKETOS TERMINAL                │')
  out('│      Local control center • v0.2            │')
  out('╰────────────────────────────────────────────╯\n')
}
function help() {
  out(`Commands:\n\n  status        Full safe status (no secrets)\n  start         Start MarketOS dev server\n  stop          Stop only the tracked MarketOS process\n  restart       Stop + start\n  hot-restart   Clear .next + restart\n  refresh       Git pull latest MarketOS code\n  build         Run npm run build\n  market        Test /api/market and summarize response\n  health        Test local app + API health\n  quota         Show safe market-data configuration\n  cache         Clear the MarketOS .next cache\n  logs          Show terminal events\n  doctor        Run environment diagnostics\n  path          Show MarketOS project path\n  clear         Clear terminal screen\n  help          Show this help\n  exit          Exit MarketOS Terminal\n`)
}
function readEnv(projectDir) {
  const p = resolve(projectDir, '.env.local')
  if (!existsSync(p)) return {}
  const obj = {}
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 1) continue
    obj[line.slice(0, idx)] = line.slice(idx + 1).trim()
  }
  return obj
}
function projectExists() { return existsSync(resolve(DEFAULT_MARKETOS, 'package.json')) }
function safeKeyState(value) { return value ? 'configured' : 'missing' }
function getPortOwner() {
  try {
    if (process.platform === 'win32') {
      const text = execFileSync('cmd.exe', ['/c', `netstat -ano | findstr :${PORT}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const match = text.match(/LISTENING\s+(\d+)/i)
      return match ? Number(match[1]) : null
    }
    const text = execFileSync('sh', ['-lc', `lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t 2>/dev/null | head -1`], { encoding: 'utf8' })
    return text.trim() ? Number(text.trim()) : null
  } catch { return null }
}
function start() {
  if (child) { out('MarketOS: already running.'); return }
  if (!projectExists()) {
    out(`ERROR: MarketOS project not found at ${DEFAULT_MARKETOS}`)
    out('Set MARKETOS_DIR to your CodeX folder.')
    return
  }
  const owner = getPortOwner()
  if (owner && owner !== child?.pid) {
    out(`ERROR: port ${PORT} is already occupied by PID ${owner}.`)
    out('Use status/doctor to investigate instead of killing an unknown process.')
    return
  }
  out(`Starting MarketOS from ${DEFAULT_MARKETOS}...`)
  child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: DEFAULT_MARKETOS,
    shell: false,
    stdio: 'inherit',
    env: process.env,
    windowsHide: false,
  })
  childStartedAt = Date.now()
  logEvent(`MarketOS start requested (pid ${child.pid})`)
  child.on('error', error => logEvent(`Process error: ${error.message}`))
  child.on('exit', (code, signal) => {
    logEvent(`MarketOS exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    child = null
    childStartedAt = null
  })
}
async function stop() {
  if (!child) {
    const owner = getPortOwner()
    out(owner ? `No tracked process. Port ${PORT} is owned by PID ${owner}; leaving it untouched.` : 'MarketOS: already stopped.')
    return
  }
  const pid = child.pid
  if (process.platform === 'win32') {
    try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch { try { child.kill() } catch {} }
  } else {
    child.kill('SIGINT')
  }
  logEvent(`MarketOS stopped (pid ${pid})`)
  child = null
  childStartedAt = null
  out('MarketOS: stopped.')
}
async function clearNextCache() {
  const nextDir = resolve(DEFAULT_MARKETOS, '.next')
  if (!existsSync(nextDir)) { out('Cache: .next does not exist.'); return }
  await rm(nextDir, { recursive: true, force: true })
  logEvent('Cleared .next cache')
  out('Cache: cleared.')
}
async function restart(clearCache = false) {
  await stop()
  if (clearCache) await clearNextCache()
  setTimeout(start, 500)
}
async function refresh() {
  if (!projectExists()) { out('MarketOS project not found.'); return }
  out('Pulling latest main...')
  const p = spawn(process.platform === 'win32' ? 'git.exe' : 'git', ['pull', '--ff-only'], { cwd: DEFAULT_MARKETOS, stdio: 'inherit', shell: false })
  await new Promise(resolveDone => p.on('close', code => { logEvent(`git pull exited ${code}`); resolveDone() }))
}
async function build() {
  if (!projectExists()) { out('MarketOS project not found.'); return }
  out('Running production build...')
  const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: DEFAULT_MARKETOS, stdio: 'inherit', shell: false })
  await new Promise(resolveDone => p.on('close', code => { logEvent(`npm run build exited ${code}`); resolveDone() }))
}
async function fetchMarket() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/market`, { signal: AbortSignal.timeout(15000) })
    const data = await response.json()
    out(`HTTP: ${response.status}  source=${data.source ?? 'unknown'}  liveData=${Boolean(data.liveData)}  quotes=${Array.isArray(data.quotes) ? data.quotes.length : 0}`)
    if (Array.isArray(data.quotes)) {
      for (const q of data.quotes.slice(0, 20)) out(`  ${q.symbol ?? '?'}  ${q.price ?? '-'}  ${q.changePercent ?? '-'}% ${q.currency ?? ''}`)
    }
  } catch (error) { out(`Market API failed: ${error instanceof Error ? error.message : String(error)}`) }
}
async function health() {
  try {
    const page = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(5000) })
    out(`Web app: ${page.status} ${page.ok ? 'OK' : 'FAILED'}`)
  } catch { out('Web app: OFFLINE') }
  try {
    const api = await fetch(`http://127.0.0.1:${PORT}/api/market`, { signal: AbortSignal.timeout(10000) })
    out(`Market API: ${api.status} ${api.ok ? 'OK' : 'FAILED'}`)
  } catch { out('Market API: OFFLINE/ERROR') }
}
function status() {
  const env = readEnv(DEFAULT_MARKETOS)
  const age = childStartedAt ? `${Math.floor((Date.now() - childStartedAt) / 1000)}s` : '-'
  const owner = getPortOwner()
  out(`\nMarketOS STATUS\n  State:       ${child ? 'RUNNING' : 'STOPPED'}\n  PID:         ${child?.pid ?? '-'}\n  Port:        ${PORT} (${owner ? `PID ${owner}` : 'free'})\n  Uptime:      ${age}\n  Project:     ${DEFAULT_MARKETOS}\n  Mode:        ${env.MARKET_DATA_MODE || 'unset'}\n  AI key:      ${safeKeyState(env.GROQ_API_KEY)}\n  Market key:  ${safeKeyState(env.TWELVE_DATA_API_KEY)}\n`)
}
function quota() {
  const env = readEnv(DEFAULT_MARKETOS)
  out(`\nMarket data configuration\n  Mode:        ${env.MARKET_DATA_MODE || 'unset'}\n  Provider:    ${env.TWELVE_DATA_API_KEY ? 'Twelve Data' : 'Demo'}\n  Cache:       60 seconds (application target)\n  API key:     ${safeKeyState(env.TWELVE_DATA_API_KEY)}\n  Security:    key value is never displayed\n`)
}
function doctor() {
  const env = readEnv(DEFAULT_MARKETOS)
  const checks = [
    ['Node', process.version],
    ['Project', projectExists() ? 'OK' : 'MISSING'],
    ['Env file', existsSync(resolve(DEFAULT_MARKETOS, '.env.local')) ? 'OK' : 'MISSING'],
    ['node_modules', existsSync(resolve(DEFAULT_MARKETOS, 'node_modules')) ? 'OK' : 'MISSING'],
    ['Next config', existsSync(resolve(DEFAULT_MARKETOS, 'next.config.ts')) || existsSync(resolve(DEFAULT_MARKETOS, 'next.config.js')) ? 'OK' : 'not found'],
    ['Market API', existsSync(resolve(DEFAULT_MARKETOS, 'app/api/market/route.ts')) ? 'OK' : 'MISSING'],
    ['AI API', existsSync(resolve(DEFAULT_MARKETOS, 'app/api/ai/route.ts')) ? 'OK' : 'MISSING'],
    ['Git', existsSync(resolve(DEFAULT_MARKETOS, '.git')) ? 'OK' : 'MISSING'],
    ['Market mode', env.MARKET_DATA_MODE || 'unset'],
    ['Port', getPortOwner() ? `occupied (${getPortOwner()})` : 'free'],
  ]
  out('\nDoctor\n' + checks.map(([k, v]) => `  ${k.padEnd(14)} ${v}`).join('\n') + '\n')
}
banner()
out(`Connected project: ${DEFAULT_MARKETOS}`)
help()
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'marketos> ' })
rl.prompt()
rl.on('line', async raw => {
  const cmd = raw.trim().toLowerCase()
  try {
    if (cmd === 'help' || cmd === '?') help()
    else if (cmd === 'status') status()
    else if (cmd === 'start') start()
    else if (cmd === 'stop') await stop()
    else if (cmd === 'restart') await restart(false)
    else if (cmd === 'hot-restart') await restart(true)
    else if (cmd === 'refresh') await refresh()
    else if (cmd === 'build') await build()
    else if (cmd === 'market') await fetchMarket()
    else if (cmd === 'health') await health()
    else if (cmd === 'quota') quota()
    else if (cmd === 'cache') await clearNextCache()
    else if (cmd === 'logs') out(events.length ? events.join('\n') : 'No terminal events yet.')
    else if (cmd === 'doctor') doctor()
    else if (cmd === 'path') out(DEFAULT_MARKETOS)
    else if (cmd === 'clear') console.clear()
    else if (cmd === 'exit' || cmd === 'quit') { await stop(); rl.close(); return }
    else if (cmd) out(`Unknown command: ${cmd}. Type help.`)
  } catch (error) { out(`ERROR: ${error instanceof Error ? error.message : String(error)}`) }
  rl.prompt()
})
process.on('SIGINT', async () => { await stop(); rl.close() })
