#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_MARKETOS = process.env.MARKETOS_DIR || resolve(ROOT, '..', 'CodeX')
let child = null
let childStartedAt = null
let lastStatus = { state: 'STOPPED', port: 3000, pid: null }

function out(msg = '') { process.stdout.write(`${msg}\n`) }
function banner() {
  out('\n╭────────────────────────────────────────────╮')
  out('│           MARKETOS TERMINAL                │')
  out('│      Local control center • v0.1            │')
  out('╰────────────────────────────────────────────╯\n')
}
function help() {
  out(`Commands:\n\n  status        Show MarketOS process + config status\n  start         Start MarketOS (npm run dev)\n  stop          Stop MarketOS\n  restart       Stop and start MarketOS\n  hot-restart   Restart MarketOS with a cache cleanup\n  refresh       Open the local MarketOS dashboard\n  market        Open the market API endpoint\n  quota         Show configured market-data mode/provider info\n  cache         Clear the MarketOS .next cache\n  logs          Show recent local terminal events\n  doctor        Run local environment checks\n  path          Show configured MarketOS project path\n  clear         Clear this terminal screen\n  help          Show this help\n  exit          Exit MarketOS Terminal\n`)
}
function logEvent(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`
  events.push(line)
}
const events = []

function readEnv(projectDir) {
  const p = resolve(projectDir, '.env.local')
  if (!existsSync(p)) return {}
  const obj = {}
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 1) continue
    obj[line.slice(0, idx)] = line.slice(idx + 1)
  }
  return obj
}

function run(command, args, cwd = DEFAULT_MARKETOS) {
  const proc = spawn(command, args, { cwd, shell: false, stdio: 'inherit', env: process.env })
  return proc
}

function stop() {
  if (!child) {
    out('MarketOS: already stopped.')
    lastStatus = { state: 'STOPPED', port: 3000, pid: null }
    return
  }
  child.kill('SIGINT')
  logEvent('MarketOS stop requested')
  out('MarketOS: stopping...')
  child = null
  childStartedAt = null
  lastStatus = { state: 'STOPPED', port: 3000, pid: null }
}

function start() {
  if (child) {
    out('MarketOS: already running.')
    return
  }
  if (!existsSync(resolve(DEFAULT_MARKETOS, 'package.json'))) {
    out(`ERROR: MarketOS project not found at ${DEFAULT_MARKETOS}`)
    out('Set MARKETOS_DIR to your CodeX folder.')
    return
  }
  out(`Starting MarketOS from ${DEFAULT_MARKETOS}...`)
  child = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], DEFAULT_MARKETOS)
  childStartedAt = Date.now()
  lastStatus = { state: 'RUNNING', port: 3000, pid: child.pid }
  logEvent(`MarketOS started (pid ${child.pid})`)
  child.on('exit', (code, signal) => {
    logEvent(`MarketOS exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    child = null
    childStartedAt = null
    lastStatus = { state: 'STOPPED', port: 3000, pid: null }
  })
}

async function restart(clearCache = false) {
  stop()
  if (clearCache) clearNextCache()
  setTimeout(start, 500)
}

function clearNextCache() {
  const nextDir = resolve(DEFAULT_MARKETOS, '.next')
  if (!existsSync(nextDir)) {
    out('Cache: .next does not exist.')
    return
  }
  const fs = await import('node:fs/promises')
  await fs.rm(nextDir, { recursive: true, force: true })
  logEvent('Cleared .next cache')
  out('Cache: cleared.')
}

function status() {
  const env = readEnv(DEFAULT_MARKETOS)
  const age = childStartedAt ? `${Math.floor((Date.now() - childStartedAt) / 1000)}s` : '-'
  out(`\nMarketOS\n  State:    ${lastStatus.state}\n  PID:      ${lastStatus.pid ?? '-'}\n  Port:     ${lastStatus.port}\n  Uptime:   ${age}\n  Project:  ${DEFAULT_MARKETOS}\n  Mode:     ${env.MARKET_DATA_MODE || 'unset'}\n  AI:       ${env.GROQ_API_KEY ? 'Groq key configured' : 'Groq key missing'}\n  Market:   ${env.TWELVE_DATA_API_KEY ? 'Twelve Data key configured' : 'Twelve Data key missing'}\n`)
}

function quota() {
  const env = readEnv(DEFAULT_MARKETOS)
  out(`\nData configuration\n  MARKET_DATA_MODE: ${env.MARKET_DATA_MODE || 'unset'}\n  Provider:          ${env.TWELVE_DATA_API_KEY ? 'Twelve Data' : 'Demo'}\n  Cache target:      60 seconds\n  Live symbols:      8\n`)
}

function openUrl(path) {
  const url = `http://localhost:3000${path}`
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
  out(`Opened ${url}`)
}

function doctor() {
  const checks = [
    ['Node', process.version],
    ['Project', existsSync(resolve(DEFAULT_MARKETOS, 'package.json')) ? 'OK' : 'MISSING'],
    ['Env file', existsSync(resolve(DEFAULT_MARKETOS, '.env.local')) ? 'OK' : 'MISSING'],
    ['Mode', readEnv(DEFAULT_MARKETOS).MARKET_DATA_MODE || 'unset'],
    ['Git metadata', existsSync(resolve(DEFAULT_MARKETOS, '.git')) ? 'OK' : 'MISSING'],
  ]
  out('\nDoctor\n' + checks.map(([k, v]) => `  ${k.padEnd(12)} ${v}`).join('\n') + '\n')
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
    else if (cmd === 'stop') stop()
    else if (cmd === 'restart') await restart(false)
    else if (cmd === 'hot-restart') await restart(true)
    else if (cmd === 'refresh') openUrl('/')
    else if (cmd === 'market') openUrl('/api/market')
    else if (cmd === 'quota') quota()
    else if (cmd === 'cache') await clearNextCache()
    else if (cmd === 'logs') out(events.length ? events.join('\n') : 'No terminal events yet.')
    else if (cmd === 'doctor') doctor()
    else if (cmd === 'path') out(DEFAULT_MARKETOS)
    else if (cmd === 'clear') console.clear()
    else if (cmd === 'exit' || cmd === 'quit') { stop(); rl.close(); return }
    else if (cmd) out(`Unknown command: ${cmd}. Type help.`)
  } catch (error) {
    out(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
  }
  rl.prompt()
})

process.on('SIGINT', () => { stop(); rl.close() })
