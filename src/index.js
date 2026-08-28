#!/usr/bin/env node
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, rm, copyFile, readdir } from 'node:fs/promises'
import { resolve, dirname, basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const TERMINAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let marketosDir = process.env.MARKETOS_DIR || resolve(TERMINAL_ROOT, '..', 'CodeX')
let port = Number(process.env.MARKETOS_PORT || 3000)
let child = null
let childStartedAt = null
const events = []
const MAX_EVENTS = 200

const out = (msg = '') => process.stdout.write(`${msg}\n`)
const ok = msg => out(`✓ ${msg}`)
const warn = msg => out(`⚠ ${msg}`)
const fail = msg => out(`✗ ${msg}`)
const logEvent = message => {
  events.push(`[${new Date().toLocaleTimeString()}] ${message}`)
  if (events.length > MAX_EVENTS) events.shift()
}

function banner() {
  out('\n╭────────────────────────────────────────────────────╮')
  out('│                 MARKETOS TERMINAL                  │')
  out('│          Local control center • v0.3                │')
  out('╰────────────────────────────────────────────────────╯\n')
}

function help() {
  out(`Commands:\n\n  status             Full safe runtime/config status\n  start              Start MarketOS dev server\n  stop               Stop only the tracked MarketOS process\n  restart            Stop + start\n  hot-restart        Clear .next + restart\n  build              Run production build\n  refresh            Git pull --ff-only\n  pull               Alias for refresh\n  sync               Show git status + pull\n  market             Test /api/market (one request)\n  stock <symbol>     Test stock endpoint if available\n  search <query>     Test demo search endpoint\n  screen             Test demo screener endpoint\n  ai <question>      Test MarketOS AI endpoint\n  health             Test web app + market API\n  doctor             Run environment diagnostics\n  config             Show safe configuration summary\n  quota              Show market-data configuration safely\n  env                Show allowed env variable names only\n  path               Show current MarketOS path\n  set-path <path>    Set project path for this session\n  set-port <port>    Set local MarketOS port for this session\n  open [path]        Open MarketOS URL in the browser\n  url [path]         Print MarketOS URL\n  port               Inspect port owner\n  cache              Clear .next cache\n  clean              Clear .next + common build cache\n  backup             Back up key project config files locally\n  recent             Show recent terminal events\n  logs               Alias for recent\n  git-status         Show concise git status\n  git-branch         Show current branch\n  git-log            Show last 5 commits\n  npm-install        Run npm install\n  typecheck          Run TypeScript check via build\n  verify             Run build + health checks\n  info               Show OS, Node, npm and repo info\n  files              List top-level project files\n  version            Show terminal version\n  clear              Clear screen\n  help               Show this help\n  exit               Exit terminal\n\nSecurity: secret values are never printed.`)
}

function readEnv(dir) {
  const p = resolve(dir, '.env.local')
  if (!existsSync(p)) return {}
  const obj = {}
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx > 0) obj[line.slice(0, idx)] = line.slice(idx + 1).trim()
  }
  return obj
}
function projectExists() { return existsSync(resolve(marketosDir, 'package.json')) }
function keyState(value) { return value ? 'configured' : 'missing' }
function commandName(name) { return process.platform === 'win32' && name === 'npm' ? 'npm.cmd' : name }

function portOwner() {
  try {
    if (process.platform === 'win32') {
      const text = execFileSync('cmd.exe', ['/c', `netstat -ano | findstr :${port}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const match = text.match(/LISTENING\s+(\d+)/i)
      return match ? Number(match[1]) : null
    }
    const text = execFileSync('sh', ['-lc', `lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null | head -1`], { encoding: 'utf8' })
    return text.trim() ? Number(text.trim()) : null
  } catch { return null }
}

function start() {
  if (child) return warn('MarketOS is already tracked as running.')
  if (!projectExists()) return fail(`MarketOS project not found: ${marketosDir}`)
  const owner = portOwner()
  if (owner) return fail(`Port ${port} is already occupied by PID ${owner}. No process was killed.`)
  out(`Starting MarketOS from ${marketosDir}...`)
  child = spawn(commandName('npm'), ['run', 'dev'], { cwd: marketosDir, shell: false, stdio: 'inherit', env: process.env })
  childStartedAt = Date.now()
  logEvent(`start requested pid=${child.pid}`)
  child.on('error', e => logEvent(`process error: ${e.message}`))
  child.on('exit', (code, signal) => {
    logEvent(`process exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    child = null
    childStartedAt = null
  })
}

async function stop() {
  if (!child) {
    const owner = portOwner()
    return owner ? warn(`No tracked process. Port ${port} belongs to PID ${owner}; leaving it untouched.`) : warn('MarketOS is already stopped.')
  }
  const pid = child.pid
  if (process.platform === 'win32') {
    try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch { try { child.kill() } catch {} }
  } else child.kill('SIGINT')
  child = null
  childStartedAt = null
  logEvent(`stop requested pid=${pid}`)
  ok('MarketOS stopped.')
}

async function clearCache() {
  const target = resolve(marketosDir, '.next')
  if (!existsSync(target)) return warn('.next cache does not exist.')
  await rm(target, { recursive: true, force: true })
  logEvent('cleared .next cache')
  ok('Next.js cache cleared.')
}
async function restart(hot = false) { await stop(); if (hot) await clearCache(); setTimeout(start, 500) }

async function runInherited(command, args, label) {
  if (!projectExists()) return fail(`MarketOS project not found: ${marketosDir}`)
  out(label)
  const p = spawn(commandName(command), args, { cwd: marketosDir, stdio: 'inherit', shell: false, env: process.env })
  const code = await new Promise(resolveDone => p.on('close', resolveDone))
  logEvent(`${command} ${args.join(' ')} exited ${code}`)
  return code
}

async function refresh() { return runInherited('git', ['pull', '--ff-only'], 'Pulling latest code...') }
async function build() { return runInherited('npm', ['run', 'build'], 'Running production build...') }
async function install() { return runInherited('npm', ['install'], 'Installing dependencies...') }

async function fetchJson(path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { ...options, signal: AbortSignal.timeout(options.timeout || 15000) })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  return { response, data, text }
}

async function market() {
  try {
    const { response, data, text } = await fetchJson('/api/market')
    out(`HTTP ${response.status}  source=${data?.source ?? 'unknown'} live=${Boolean(data?.liveData)} quotes=${Array.isArray(data?.quotes) ? data.quotes.length : 0}`)
    if (Array.isArray(data?.quotes)) for (const q of data.quotes.slice(0, 20)) out(`  ${q.symbol ?? '?'}  ${q.price ?? '-'}  ${q.changePercent ?? '-'}%  ${q.currency ?? ''}`)
    if (!data) out(text.slice(0, 500))
  } catch (e) { fail(`Market API: ${e instanceof Error ? e.message : String(e)}`) }
}
async function stock(symbol) {
  const clean = String(symbol || '').trim().toUpperCase()
  if (!clean) return warn('Usage: stock TCS')
  try {
    const candidates = [`/api/market/stock?symbol=${encodeURIComponent(clean)}`, `/api/demo/search?q=${encodeURIComponent(clean)}`]
    for (const path of candidates) {
      const { response, data } = await fetchJson(path)
      if (response.ok) { out(JSON.stringify(data, null, 2)); return }
    }
    warn(`No stock API route was found for ${clean}.`)
  } catch (e) { fail(`Stock request failed: ${e instanceof Error ? e.message : String(e)}`) }
}
async function search(query) {
  if (!query) return warn('Usage: search TCS')
  try {
    const { response, data, text } = await fetchJson(`/api/demo/search?q=${encodeURIComponent(query)}`)
    out(`HTTP ${response.status}`)
    out(JSON.stringify(data ?? text, null, 2))
  } catch (e) { fail(`Search failed: ${e instanceof Error ? e.message : String(e)}`) }
}
async function screen() {
  try {
    const { response, data, text } = await fetchJson('/api/demo/screen?pe=30&roe=15&growth=10&debt=2')
    out(`HTTP ${response.status}`)
    out(JSON.stringify(data ?? text, null, 2))
  } catch (e) { fail(`Screen failed: ${e instanceof Error ? e.message : String(e)}`) }
}
async function ai(question) {
  if (!question) return warn('Usage: ai compare TCS and Infosys')
  try {
    const { response, data, text } = await fetchJson('/api/ai', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: question })
    })
    out(`HTTP ${response.status}`)
    out(data?.answer ?? data?.error ?? text.slice(0, 1200))
  } catch (e) { fail(`AI request failed: ${e instanceof Error ? e.message : String(e)}`) }
}
async function health() {
  try { const { response } = await fetchJson('/'); ok(`Web app ${response.status}`) } catch { fail('Web app offline') }
  try { const { response, data } = await fetchJson('/api/market', { timeout: 10000 }); out(`Market API ${response.status}  source=${data?.source ?? 'unknown'}  quotes=${Array.isArray(data?.quotes) ? data.quotes.length : 0}`) } catch { fail('Market API offline/error') }
}

function status() {
  const env = readEnv(marketosDir)
  const age = childStartedAt ? `${Math.floor((Date.now() - childStartedAt) / 1000)}s` : '-'
  const owner = portOwner()
  out(`\nMarketOS STATUS\n  State:       ${child ? 'RUNNING' : 'STOPPED'}\n  PID:         ${child?.pid ?? '-'}\n  Port:        ${port} (${owner ? `PID ${owner}` : 'free'})\n  Uptime:      ${age}\n  Project:     ${marketosDir}\n  Mode:        ${env.MARKET_DATA_MODE || 'unset'}\n  AI key:      ${keyState(env.GROQ_API_KEY)}\n  Market key:  ${keyState(env.TWELVE_DATA_API_KEY)}\n`)
}
function config() {
  const env = readEnv(marketosDir)
  out(`\nConfiguration\n  Project: ${marketosDir}\n  Port: ${port}\n  MARKET_DATA_MODE: ${env.MARKET_DATA_MODE || 'unset'}\n  GROQ_MODEL: ${env.GROQ_MODEL || 'default'}\n  GROQ_API_KEY: ${keyState(env.GROQ_API_KEY)}\n  TWELVE_DATA_API_KEY: ${keyState(env.TWELVE_DATA_API_KEY)}\n  Secrets: values hidden\n`)
}
function quota() {
  const env = readEnv(marketosDir)
  out(`\nMarket data\n  Mode: ${env.MARKET_DATA_MODE || 'unset'}\n  Provider: ${env.TWELVE_DATA_API_KEY ? 'Twelve Data' : 'Demo'}\n  Live symbols: 8\n  Application cache target: 60s\n  Key: ${keyState(env.TWELVE_DATA_API_KEY)}\n`)
}
function envNames() {
  const names = Object.keys(readEnv(marketosDir)).sort()
  out(names.length ? names.join('\n') : 'No env entries found.')
}
function pathInfo() { out(marketosDir) }
function setPath(value) { if (!value) return warn('Usage: set-path D:\\ESHHAN\\My ShareMarket APP\\CodeX'); marketosDir = resolve(value); ok(`Project path set to ${marketosDir}`) }
function setPort(value) { const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 65535) return warn('Usage: set-port 3000'); port = n; ok(`Port set to ${port}`) }
function openUrl(path = '/') {
  const url = `http://127.0.0.1:${port}${path.startsWith('/') ? path : `/${path}`}`
  if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
  else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  out(url)
}
function printUrl(path = '/') { out(`http://127.0.0.1:${port}${path.startsWith('/') ? path : `/${path}`}`) }
function portInfo() { const owner = portOwner(); out(owner ? `Port ${port}: LISTENING (PID ${owner})` : `Port ${port}: FREE`) }
async function clean() { await clearCache(); const targets = ['.turbo', 'out']; for (const t of targets) { const p = resolve(marketosDir, t); if (existsSync(p)) { await rm(p, { recursive: true, force: true }); logEvent(`removed ${t}`) } } ok('Common build caches cleaned where present.') }
async function backup() {
  if (!projectExists()) return fail('MarketOS project not found.')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = resolve(marketosDir, 'backups', `terminal-${stamp}`)
  await mkdir(dest, { recursive: true })
  for (const file of ['package.json', 'tsconfig.json', 'next.config.ts', 'next.config.js', '.env.local']) {
    const src = resolve(marketosDir, file)
    if (existsSync(src)) {
      await copyFile(src, join(dest, basename(file)))
    }
  }
  ok(`Backup created at ${dest}`)
  logEvent(`backup ${dest}`)
}
function recent() { out(events.length ? events.join('\n') : 'No events yet.') }
function gitStatus() { runInherited('git', ['status', '--short'], 'Git status:') }
function gitBranch() { runInherited('git', ['branch', '--show-current'], 'Current branch:') }
function gitLog() { runInherited('git', ['log', '-5', '--oneline', '--decorate'], 'Recent commits:') }
async function verify() {
  const buildCode = await build()
  if (buildCode !== 0) return fail('Build failed; health checks not considered a pass.')
  await health()
  ok('Verify sequence completed.')
}
function info() {
  const npm = spawnSync(commandName('npm'), ['--version'], { encoding: 'utf8' })
  out(`\nSystem\n  OS: ${os.platform()} ${os.release()}\n  Arch: ${os.arch()}\n  CPU cores: ${os.cpus().length}\n  Node: ${process.version}\n  npm: ${(npm.stdout || '').trim() || 'unknown'}\n  Terminal: v0.3\n`)
}
async function files() {
  if (!projectExists()) return fail('MarketOS project not found.')
  const entries = await readdir(marketosDir, { withFileTypes: true })
  for (const e of entries.slice(0, 80)) out(`${e.isDirectory() ? '[DIR] ' : '      '}${e.name}`)
}
function version() { out('MarketOS Terminal v0.3.0') }

banner()
out(`Connected project: ${marketosDir}`)
out(`Port: ${port}`)
help()

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'marketos> ' })
rl.prompt()
rl.on('line', async raw => {
  const parts = raw.trim().split(/\s+/)
  const cmd = (parts.shift() || '').toLowerCase()
  const args = parts
  try {
    if (cmd === 'help' || cmd === '?') help()
    else if (cmd === 'status') status()
    else if (cmd === 'start') start()
    else if (cmd === 'stop') await stop()
    else if (cmd === 'restart') await restart(false)
    else if (cmd === 'hot-restart') await restart(true)
    else if (cmd === 'refresh' || cmd === 'pull') await refresh()
    else if (cmd === 'sync') { gitStatus(); await refresh() }
    else if (cmd === 'build') await build()
    else if (cmd === 'market') await market()
    else if (cmd === 'stock') await stock(args[0])
    else if (cmd === 'search') await search(args.join(' '))
    else if (cmd === 'screen') await screen()
    else if (cmd === 'ai') await ai(args.join(' '))
    else if (cmd === 'health') await health()
    else if (cmd === 'doctor') { status(); info(); envNames(); }
    else if (cmd === 'config') config()
    else if (cmd === 'quota') quota()
    else if (cmd === 'env') envNames()
    else if (cmd === 'path') pathInfo()
    else if (cmd === 'set-path') setPath(args.join(' '))
    else if (cmd === 'set-port') setPort(args[0])
    else if (cmd === 'open') openUrl(args[0] || '/')
    else if (cmd === 'url') printUrl(args[0] || '/')
    else if (cmd === 'port') portInfo()
    else if (cmd === 'cache') await clearCache()
    else if (cmd === 'clean') await clean()
    else if (cmd === 'backup') await backup()
    else if (cmd === 'recent' || cmd === 'logs') recent()
    else if (cmd === 'git-status') await gitStatus()
    else if (cmd === 'git-branch') await gitBranch()
    else if (cmd === 'git-log') await gitLog()
    else if (cmd === 'npm-install') await install()
    else if (cmd === 'typecheck') await build()
    else if (cmd === 'verify') await verify()
    else if (cmd === 'info') info()
    else if (cmd === 'files') await files()
    else if (cmd === 'version') version()
    else if (cmd === 'clear') console.clear()
    else if (cmd === 'exit' || cmd === 'quit') { await stop(); rl.close(); return }
    else if (cmd) warn(`Unknown command: ${cmd}. Type help.`)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
  rl.prompt()
})

process.on('SIGINT', async () => { await stop(); rl.close() })
