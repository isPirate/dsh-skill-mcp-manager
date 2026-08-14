/**
 * dsh-skill-mcp-manager — host half.
 *
 * Mounts:
 *  - the /api/dsh-skill-mcp route family (skills list/toggle, MCP CRUD/check),
 *  - the model tool skillmcp_manage (skills + MCP management),
 *  - a system-prompt announcement.
 * The browser half (./client) renders the「技能与 MCP」settings section and
 * talks to this route family with plain same-origin fetch.
 *
 * Config storage: skills = SKILL.md frontmatter (disable-model-invocation /
 * user-invocable); MCP = the managed block in ~/.dsh/cordis.patch.yml,
 * hot-applied by the composition watcher (no restart needed).
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'skill-mcp-manager'

export const inject = ['webServer', 'tools', 'systemPrompt']

const MANAGED_START = '# --- dsh-skill-mcp-manager managed (auto-generated; do not edit) ---'
const MANAGED_END = '# --- end dsh-skill-mcp-manager managed ---'
const JSON_MARK = '# dshmcp-json:'
const PATCH_PARTS = ['.dsh', 'cordis.patch.yml']

const GUIDANCE = '本机已安装 dsh-skill-mcp-manager 插件：设置页「技能与 MCP」管理技能（Skill）启用/禁用与 MCP 服务器（增删改查、连接状态检测、文本格式化导入，配置写入 ~/.dsh/cordis.patch.yml 热生效）；模型工具 skillmcp_manage 提供同等能力。用户提到「技能管理 / Skill 启用禁用 / MCP 管理 / 添加 MCP」时即指本插件，请据此协作。'

// ---------------------------------------------------------------- helpers

/** Cap on JSON request bodies. */
const MAX_JSON_BODY_BYTES = 64 * 1024

/** Loopback-only + same-origin trust fence (executing hosts / writing config). */
function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = req.headers?.host
  if (typeof host !== 'string') return false
  let hostUrl
  try { hostUrl = new URL('http://' + host) } catch { return false }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === hostUrl.host } catch { return false }
}

/** One JSON response. */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(chunk)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined
  } catch { return undefined }
}

// ------------------------------------------------------------ node helper

const NODE_SCRIPT = [
  'const fs=require("fs"),os=require("os"),path=require("path");',
  'let input="";process.stdin.setEncoding("utf8");',
  'process.stdin.on("data",d=>{input+=d});',
  'process.stdin.on("end",()=>{',
  'let req={};try{req=JSON.parse(input)}catch(e){req={op:"error"}}',
  '(async()=>{try{const out=await run(req);process.stdout.write(JSON.stringify({ok:true,out}))}',
  'catch(e){process.stdout.write(JSON.stringify({ok:false,error:String((e&&e.message)||e)}))}})();',
  '});',
  'function target(req){return req.abs?req.abs:path.join(os.homedir(),...(req.parts||[]))}',
  'async function run(req){',
  'if(req.op==="read"){const p=target(req);return{exists:fs.existsSync(p),content:fs.existsSync(p)?fs.readFileSync(p,"utf8"):null}}',
  'if(req.op==="write"){const p=target(req);if(req.abs&&!p.toLowerCase().startsWith(os.homedir().toLowerCase())&&!req.allowOutsideHome)throw new Error("refusing write outside home: "+p);',
  'fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+".tmp"+process.pid;fs.writeFileSync(tmp,req.content,"utf8");fs.renameSync(tmp,p);return{path:p}}',
  'if(req.op==="remove"){const p=target(req);if(fs.existsSync(p))fs.unlinkSync(p);return{path:p}}',
  'if(req.op==="exists"){const p=target(req);return{exists:fs.existsSync(p)}}',
  'if(req.op==="http-check"){return httpCheck(req)}',
  'throw new Error("unknown op "+req.op)}',
  'async function httpCheck(req){',
  'const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),req.timeoutMs||8000);',
  'try{const res=await fetch(req.url,{method:"POST",headers:Object.assign({"content-type":"application/json","accept":"application/json, text/event-stream"},req.headers||{}),body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"dsh-healthcheck",version:"1.0"}}}),signal:ctrl.signal});clearTimeout(t);return{reachable:true,status:res.status}}',
  'catch(e){clearTimeout(t);return{reachable:false,error:String((e&&e.message)||e)}}',
  '}',
].join('\n')

export function apply(ctx) {
  const skills = ctx.get('skills')
  const subprocess = ctx.get('subprocess')
  const sandboxPolicy = ctx.get('sandboxPolicy')
  const fs = ctx.get('fs')
  const agentPresets = ctx.get('agentPresets')

  async function nodeRun(req) {
    if (!subprocess) throw new Error('subprocess 服务不可用')
    const ws = (sandboxPolicy && sandboxPolicy.workspaceRoot) || '.'
    const node = await subprocess.resolveExecutable('node')
    const handle = subprocess.spawn({
      argv: [node, '-e', NODE_SCRIPT],
      cwd: ws,
      stdio: { stdin: 'pipe', stdout: { maxBytes: 2097152 }, stderr: { maxBytes: 65536 } },
      graceMs: 10000,
    })
    if (!handle.stdin) throw new Error('stdin pipe unavailable')
    handle.stdin.end(JSON.stringify(req))
    const outcome = await handle.done
    const stdout = (handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : '') || ''
    const stderr = (handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : '') || ''
    let parsed = null
    try { parsed = JSON.parse(stdout) } catch { /* fallthrough */ }
    if (!parsed || !parsed.ok) {
      const why = (parsed && parsed.error) ? parsed.error : (stdout.slice(0, 200) || 'no stdout')
      throw new Error('node helper 失败 (exit ' + outcome.exitCode + '): ' + why + (stderr ? ' | stderr: ' + stderr.slice(0, 200) : ''))
    }
    return parsed.out
  }

  async function fileChannel(path) {
    if (fs && sandboxPolicy && sandboxPolicy.workspaceRoot) {
      try {
        const t = await fs.resolve(path)
        const w = await fs.resolve(sandboxPolicy.workspaceRoot)
        if (fs.contains(w, t)) return { via: 'fs', target: t }
      } catch { /* fallthrough */ }
    }
    return { via: 'node' }
  }
  async function readFileSmart(path) {
    const ch = await fileChannel(path)
    if (ch.via === 'fs') return { content: await fs.readText(ch.target) }
    const r = await nodeRun({ op: 'read', abs: path })
    if (!r.exists) throw new Error('文件不存在: ' + path)
    return { content: r.content }
  }
  async function writeFileSmart(path, content) {
    const ch = await fileChannel(path)
    if (ch.via === 'fs') { await fs.writeText(ch.target, content); return }
    await nodeRun({ op: 'write', abs: path, content })
  }

  // -------------------------------------------------- skill frontmatter

  function editSkillFrontmatter(content, info, enabled) {
    const nl = content.indexOf('\r\n') >= 0 ? '\r\n' : '\n'
    const lines = content.split(/\r?\n/)
    let fm = null
    let bodyStart = 0
    if (lines[0] === '---') {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') { fm = lines.slice(1, i); bodyStart = i + 1; break }
      }
    }
    const body = lines.slice(bodyStart)
    const out = []
    let hasName = false
    let hasDesc = false
    const keyRe = /^\s*(disable-model-invocation|user-invocable)\s*:/
    for (const line of (fm || [])) {
      if (keyRe.test(line)) continue
      if (/^\s*name\s*:/.test(line)) hasName = true
      if (/^\s*description\s*:/.test(line)) hasDesc = true
      out.push(line)
    }
    const add = []
    if (!hasName) add.push('name: ' + info.name)
    if (!hasDesc) add.push('description: ' + JSON.stringify(info.description || ''))
    if (!enabled) add.push('disable-model-invocation: true', 'user-invocable: false')
    out.push(...add)
    if (fm === null && add.length === 0) return content
    const head = (fm === null) ? [] : ['---']
    const tail = (fm === null) ? [] : ['---']
    return head.concat(out, tail, body).join(nl)
  }

  let standingScope = null
  async function viewScope() {
    if (standingScope !== null) return standingScope
    try {
      if (agentPresets) standingScope = await agentPresets.standingKeyFor()
    } catch { /* keep null */ }
    return standingScope
  }

  // ------------------------------------------------------- MCP patch file

  function yamlString(s) { return JSON.stringify(String(s)) }
  function sanitizeMap(map, kind) {
    const out = {}
    const keyRe = kind === 'env' ? /^[A-Za-z_][A-Za-z0-9_]*$/ : /^[A-Za-z0-9._-]+$/
    for (const k of Object.keys(map)) {
      if (!keyRe.test(k)) throw new Error(kind + ' 键名不合法: ' + k)
      out[k] = String(map[k])
    }
    return out
  }
  function normalizeServerName(raw) {
    let s = String(raw == null ? '' : raw).trim().toLowerCase()
    s = s.replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
    if (!s) s = 'mcp-server'
    if (s.length > 32) s = s.slice(0, 32).replace(/-+$/g, '')
    return s
  }
  function renderManagedBlock(servers) {
    const json = JSON.stringify(servers.map(s => ({
      id: s.id, serverName: s.serverName, transport: s.transport, enabled: s.enabled !== false, config: s.config || {},
    })))
    const lines = [MANAGED_START, JSON_MARK + ' ' + json, '- insert:' + (servers.length ? '' : ' []')]
    for (const s of servers) {
      const cfg = s.config || {}
      lines.push('    - id: ' + s.id)
      lines.push("      name: '@deepseek-ai/dsh-mcp-client'")
      if (s.enabled === false) lines.push('      disabled: true')
      lines.push('      config:')
      lines.push('        serverName: ' + s.serverName)
      lines.push('        transport: ' + s.transport)
      if (s.transport === 'stdio') {
        lines.push('        command: ' + yamlString(cfg.command))
        if (Array.isArray(cfg.args) && cfg.args.length) lines.push('        args: ' + JSON.stringify(cfg.args.map(String)))
        if (cfg.cwd) lines.push('        cwd: ' + yamlString(cfg.cwd))
        if (cfg.env && Object.keys(cfg.env).length) {
          lines.push('        env:')
          for (const k of Object.keys(cfg.env)) lines.push('          ' + k + ': ' + yamlString(cfg.env[k]))
        }
      } else {
        lines.push('        url: ' + yamlString(cfg.url))
        if (cfg.headers && Object.keys(cfg.headers).length) {
          lines.push('        headers:')
          for (const k of Object.keys(cfg.headers)) lines.push('          ' + k + ': ' + yamlString(cfg.headers[k]))
        }
      }
      if (cfg.toolCallTimeoutMs) lines.push('        toolCallTimeoutMs: ' + cfg.toolCallTimeoutMs)
      if (cfg.failOnStartupError !== undefined) lines.push('        failOnStartupError: ' + (cfg.failOnStartupError ? 'true' : 'false'))
      if (cfg.reconnect && typeof cfg.reconnect === 'object') {
        const r = cfg.reconnect
        if (r.enabled !== undefined || r.initialDelayMs || r.maxDelayMs || r.maxAttempts) {
          lines.push('        reconnect:')
          if (r.enabled !== undefined) lines.push('          enabled: ' + (r.enabled ? 'true' : 'false'))
          if (r.initialDelayMs) lines.push('          initialDelayMs: ' + r.initialDelayMs)
          if (r.maxDelayMs) lines.push('          maxDelayMs: ' + r.maxDelayMs)
          if (r.maxAttempts) lines.push('          maxAttempts: ' + r.maxAttempts)
        }
      }
    }
    lines.push(MANAGED_END)
    return lines.join('\n')
  }

  async function readPatchState() {
    const r = await nodeRun({ op: 'read', parts: PATCH_PARTS })
    const content = r.exists ? r.content : null
    let servers = []
    let blockStart = -1
    let blockEnd = -1
    if (content) {
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim()
        if (t === MANAGED_START) blockStart = i
        else if (t === MANAGED_END) blockEnd = i
      }
      if (blockStart >= 0 && blockEnd > blockStart) {
        const json = lines.find(l => l.startsWith(JSON_MARK))
        if (json) {
          try {
            const parsed = JSON.parse(json.slice(JSON_MARK.length).trim())
            if (Array.isArray(parsed)) servers = parsed
          } catch { servers = [] }
        }
      }
    }
    return { content, servers, blockStart, blockEnd }
  }
  async function writePatchState(content, blockStart, blockEnd, servers) {
    if (servers.length === 0) {
      if (content === null || blockStart < 0) return
      const lines = content.split('\n')
      const next = lines.slice(0, blockStart).concat(lines.slice(blockEnd + 1)).join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n'
      await nodeRun({ op: 'write', parts: PATCH_PARTS, content: next })
      return
    }
    const block = renderManagedBlock(servers)
    let next
    if (content === null) {
      next = '# Managed by 技能与 MCP 设置 (dsh-skill-mcp-manager plugin)\n' + block + '\n'
    } else if (blockStart >= 0 && blockEnd > blockStart) {
      const lines = content.split('\n')
      next = lines.slice(0, blockStart).concat(block.split('\n'), lines.slice(blockEnd + 1)).join('\n')
    } else {
      next = content.replace(/\s+$/, '') + '\n\n' + block + '\n'
    }
    await nodeRun({ op: 'write', parts: PATCH_PARTS, content: next })
  }
  function targetOf(s) {
    const cfg = s.config || {}
    return s.transport === 'stdio' ? (cfg.command || '') : (cfg.url || '')
  }
  function parseBlockBestEffort(lines) {
    const out = []
    let cur = null
    for (const line of lines) {
      const m = /^\s*- id:\s*(\S+)\s*$/.exec(line)
      if (m) { cur = { id: m[1], serverName: null, transport: null, enabled: true, config: {} }; out.push(cur); continue }
      if (!cur) continue
      let mm = /^\s*serverName:\s*(\S+)/.exec(line); if (mm) cur.serverName = mm[1]
      mm = /^\s*transport:\s*(\S+)/.exec(line); if (mm) cur.transport = mm[1]
      mm = /^\s*disabled:\s*(true|false)/.exec(line); if (mm) cur.enabled = mm[1] !== 'true'
      mm = /^\s*command:\s*['"]?([^'"\n]+)['"]?\s*$/.exec(line); if (mm) cur.config.command = mm[1].trim()
      mm = /^\s*url:\s*['"]?([^'"\n]+)['"]?\s*$/.exec(line); if (mm) cur.config.url = mm[1].trim()
    }
    return out.map(s => ({ id: s.id, serverName: s.serverName, transport: s.transport, enabled: s.enabled, target: targetOf(s), config: s.config }))
  }
  function hasDisabledNear(lines, i) {
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      if (/^[-] /.test(lines[j]) || (/^\S/.test(lines[j]) && !lines[j].startsWith(' '))) break
      const m = /^\s*disabled:\s*(true|false)\s*$/.exec(lines[j])
      if (m) return m[1] === 'true'
    }
    return false
  }
  function detectUserRows(lines, blockStart, blockEnd) {
    const user = []
    const seen = new Set()
    const nameRe = /name:\s*['"]@deepseek-ai\/dsh-mcp-client['"]/
    const idRe = /^- id:\s*(\S+)\s*$/
    for (let i = 0; i < lines.length; i++) {
      if (blockStart >= 0 && i >= blockStart && i <= blockEnd) continue
      if (nameRe.test(lines[i])) {
        let id = null
        for (let j = i - 1; j >= Math.max(0, i - 60); j--) {
          const m = idRe.exec(lines[j])
          if (m) { id = m[1]; break }
        }
        if (id && !seen.has(id)) { seen.add(id); user.push({ id, disabled: hasDisabledNear(lines, i) }) }
      }
    }
    for (let i = 0; i < lines.length; i++) {
      if (blockStart >= 0 && i >= blockStart && i <= blockEnd) continue
      const m = idRe.exec(lines[i])
      if (!m) continue
      const id = m[1]
      if (!/^mcp-/.test(id) || seen.has(id)) continue
      let hasName = false
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        if (/^- /.test(lines[j]) || (/^\S/.test(lines[j]) && !lines[j].startsWith(' '))) break
        if (/name:/.test(lines[j])) hasName = true
      }
      if (hasName) continue
      seen.add(id)
      user.push({ id, disabled: hasDisabledNear(lines, i) })
    }
    return user
  }
  function parsePatchFile(content) {
    const lines = content.split('\n')
    let blockStart = -1
    let blockEnd = -1
    let jsonLine = -1
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (t === MANAGED_START) blockStart = i
      else if (t === MANAGED_END) blockEnd = i
      else if (t.startsWith(JSON_MARK)) jsonLine = i
    }
    let managed = []
    if (blockStart >= 0 && blockEnd > blockStart) {
      if (jsonLine >= 0) {
        try {
          const parsed = JSON.parse(lines[jsonLine].slice(JSON_MARK.length).trim())
          if (Array.isArray(parsed)) {
            managed = parsed.map(s => ({ id: s.id, serverName: s.serverName, transport: s.transport, enabled: s.enabled !== false, target: targetOf(s), config: s.config || {} }))
          }
        } catch { managed = parseBlockBestEffort(lines.slice(blockStart, blockEnd + 1)) }
      } else {
        managed = parseBlockBestEffort(lines.slice(blockStart, blockEnd + 1))
      }
    }
    return { managed, user: detectUserRows(lines, blockStart, blockEnd) }
  }

  // ----------------------------------------------------------- business

  async function skillView() {
    const scope = await viewScope()
    const ws = (sandboxPolicy && sandboxPolicy.workspaceRoot) || undefined
    const options = {}
    if (ws) options.cwd = ws
    if (scope) options.scope = scope
    return options
  }
  async function listSkills() {
    if (!skills) throw new Error('skills 服务不可用')
    const options = await skillView()
    const list = await skills.list(options)
    const out = []
    for (const s of list) {
      const item = {
        name: s.name,
        description: s.description || '',
        provider: s.provider,
        modelInvocable: !!(s.invocation && s.invocation.modelInvocable),
        userInvocable: !!(s.invocation && s.invocation.userInvocable),
        path: null,
        manageable: false,
      }
      if (s.provider === 'filesystem') {
        try {
          const d = await skills.get(s.name, options)
          if (d && d.path) { item.path = d.path; item.manageable = true }
        } catch { /* keep */ }
      }
      out.push(item)
    }
    return { skills: out }
  }
  async function setSkillEnabled(name, enabled) {
    if (!skills) throw new Error('skills 服务不可用')
    const options = await skillView()
    const d = await skills.get(name, options)
    if (!d) throw new Error('技能不存在: ' + name)
    if (!d.path) throw new Error('该技能无文件路径（来源: ' + d.provider + '），无法切换')
    const read = await readFileSmart(d.path)
    const next = editSkillFrontmatter(read.content, { name, description: d.description || '' }, enabled)
    if (next !== read.content) {
      try {
        await writeFileSmart(d.path, next)
      } catch (e) {
        const msg = String((e && e.message) || e)
        if (msg.indexOf('refusing write outside home') >= 0) throw new Error('该技能位于受保护目录（非用户主目录/工作区），无法通过本插件修改')
        throw e
      }
    }
    return { path: d.path, changed: next !== read.content }
  }
  async function listMcp() {
    const r = await nodeRun({ op: 'read', parts: PATCH_PARTS })
    if (!r.exists) return { exists: false, managed: [], user: [] }
    return { exists: true, ...parsePatchFile(r.content) }
  }
  function buildServerConfig(s) {
    const config = {}
    if (s.transport === 'stdio') {
      const command = String(s.command || '').trim()
      if (!command) throw new Error('stdio 传输必须填写 command')
      config.command = command
      if (Array.isArray(s.args)) config.args = s.args.map(String).filter(Boolean)
      if (s.cwd) config.cwd = String(s.cwd)
      if (s.env && typeof s.env === 'object') config.env = sanitizeMap(s.env, 'env')
    } else {
      const url = String(s.url || '').trim()
      if (!/^https?:\/\//.test(url)) throw new Error('url 必须是 http(s) 地址')
      config.url = url
      if (s.headers && typeof s.headers === 'object') config.headers = sanitizeMap(s.headers, 'headers')
    }
    if (s.toolCallTimeoutMs) {
      const n = Number(s.toolCallTimeoutMs)
      if (Number.isFinite(n) && n > 0) config.toolCallTimeoutMs = Math.floor(n)
    }
    if (typeof s.failOnStartupError === 'boolean') config.failOnStartupError = s.failOnStartupError
    if (s.reconnect && typeof s.reconnect === 'object') {
      const r = {}
      if (typeof s.reconnect.enabled === 'boolean') r.enabled = s.reconnect.enabled
      if (s.reconnect.initialDelayMs) { const n = Number(s.reconnect.initialDelayMs); if (Number.isFinite(n) && n > 0) r.initialDelayMs = Math.floor(n) }
      if (s.reconnect.maxDelayMs) { const n = Number(s.reconnect.maxDelayMs); if (Number.isFinite(n) && n > 0) r.maxDelayMs = Math.floor(n) }
      if (s.reconnect.maxAttempts) { const n = Number(s.reconnect.maxAttempts); if (Number.isFinite(n) && n > 0) r.maxAttempts = Math.floor(n) }
      if (Object.keys(r).length) config.reconnect = r
    }
    return config
  }
  async function saveMcpServer(input) {
    const raw = input || {}
    let transport = String(raw.transport || raw.type || '')
    if (transport === 'sse' || transport === 'http') transport = 'streamable-http'
    if (!transport && raw.command) transport = 'stdio'
    if (transport !== 'stdio' && transport !== 'streamable-http') throw new Error('transport 必须是 stdio 或 streamable-http')
    if (!String(raw.serverName || '').trim()) throw new Error('必须提供名称（serverName），不支持无名称的配置')
    const name = normalizeServerName(raw.serverName)
    const config = buildServerConfig({ transport, ...(raw || {}) })
    const id = (raw && /^mcp-[A-Za-z0-9_-]+$/.test(String(raw.id))) ? String(raw.id) : ('mcp-' + name)
    const st = await readPatchState()
    const idx = st.servers.findIndex(x => x.id === id)
    const server = { id, serverName: name, transport, enabled: !(raw && raw.enabled === false), config }
    if (idx >= 0) st.servers[idx] = server; else st.servers.push(server)
    await writePatchState(st.content, st.blockStart, st.blockEnd, st.servers)
    return { id, serverName: name }
  }
  async function setMcpEnabled(id, enabled) {
    if (!/^[A-Za-z0-9_-]+$/.test(String(id))) throw new Error('非法 id')
    const st = await readPatchState()
    const idx = st.servers.findIndex(x => x.id === id)
    if (idx >= 0) {
      st.servers[idx] = Object.assign({}, st.servers[idx], { enabled: !!enabled })
      await writePatchState(st.content, st.blockStart, st.blockEnd, st.servers)
      return { mode: 'managed' }
    }
    const patch = '- id: ' + id + '\n  disabled: ' + (enabled ? 'false' : 'true') + '\n'
    let next
    if (st.content === null) next = '# Managed by 技能与 MCP 设置 (dsh-skill-mcp-manager plugin)\n' + patch
    else next = st.content.replace(/\s+$/, '') + '\n\n' + patch
    await nodeRun({ op: 'write', parts: PATCH_PARTS, content: next })
    return { mode: 'user' }
  }
  async function removeMcpServer(id) {
    const st = await readPatchState()
    const idx = st.servers.findIndex(x => x.id === id)
    if (idx < 0) throw new Error('托管服务器不存在: ' + id)
    st.servers.splice(idx, 1)
    await writePatchState(st.content, st.blockStart, st.blockEnd, st.servers)
    return { id }
  }

  // ---------------------------------------------------------- status check

  async function mcpToolsRegistered(serverName) {
    try {
      const toolsSvc = ctx.get('tools')
      if (!toolsSvc || typeof toolsSvc.schemas !== 'function') return null
      const seen = []
      try { seen.push(...(toolsSvc.schemas() || [])) } catch { /* ignore */ }
      try {
        const scope = await viewScope()
        if (scope) seen.push(...(toolsSvc.schemas(scope) || []))
      } catch { /* ignore */ }
      const prefix = 'mcp__' + serverName + '__'
      return seen.some(t => t && String(t.name || '').indexOf(prefix) === 0)
    } catch {
      return null
    }
  }
  async function probeStdio(s) {
    const cfg = s.config || {}
    const command = String(cfg.command || '').trim()
    if (!command) return { ok: false, reason: '未配置启动命令' }
    if (!subprocess) return { ok: null, reason: 'subprocess 服务不可用' }
    const timerSvc = ctx.get('timer')
    if (!timerSvc) return { ok: null, reason: 'timer 服务不可用' }
    let exe
    try {
      exe = await subprocess.resolveExecutable(command)
    } catch (e) {
      return { ok: false, reason: '找不到命令 ' + command, detail: String((e && e.message) || e) }
    }
    const spec = {
      argv: [exe].concat((cfg.args || []).map(String)),
      cwd: cfg.cwd || (sandboxPolicy && sandboxPolicy.workspaceRoot) || '.',
      stdio: { stdin: 'pipe', stdout: { maxBytes: 131072 }, stderr: { maxBytes: 131072 } },
      graceMs: 800,
    }
    if (cfg.env && typeof cfg.env === 'object') spec.env = cfg.env
    let handle
    try {
      handle = subprocess.spawn(spec)
    } catch (e) {
      return { ok: false, reason: '启动失败', detail: String((e && e.message) || e) }
    }
    let exited = null
    try {
      const outcome = await Promise.race([
        handle.done.then(o => ({ kind: 'exit', o })),
        timerSvc.timeout(2500).then(() => ({ kind: 'alive' })),
      ])
      if (outcome.kind === 'exit') exited = outcome.o
    } catch (e) {
      exited = { exitCode: 'spawn-error', error: String((e && e.message) || e) }
    }
    if (!exited) {
      try { if (handle.terminate) await handle.terminate(); else if (handle.kill) handle.kill() } catch { /* ignore */ }
      return { ok: true, note: '进程已启动并保持运行' }
    }
    if (exited.error || (exited.exitCode !== undefined && exited.exitCode !== 0)) {
      let stderr = ''
      try { stderr = (handle.collected && handle.collected.stderr) ? handle.collected.stderr.readFrom(0).text : '' } catch { /* ignore */ }
      return {
        ok: false,
        reason: '启动后立即退出（' + (exited.error || ('exit ' + exited.exitCode)) + '）',
        detail: (stderr || '').slice(0, 300),
      }
    }
    return { ok: false, reason: '启动后立即退出（exit 0）' }
  }
  async function probeHttp(s) {
    const cfg = s.config || {}
    const url = String(cfg.url || '').trim()
    if (!url) return { ok: false, reason: '未配置 url' }
    try {
      const r = await nodeRun({ op: 'http-check', url, headers: cfg.headers || {}, timeoutMs: 8000 })
      if (r && r.reachable) return { ok: true, note: 'HTTP ' + r.status + '（initialize 已响应）' }
      return { ok: false, reason: '无法连接', detail: (r && r.error) || '未知错误' }
    } catch (e) {
      return { ok: false, reason: '检测失败', detail: String((e && e.message) || e) }
    }
  }
  async function checkMcpServer(id, wantProbe) {
    const st = await readPatchState()
    const s = st.servers.find(x => x.id === id)
    if (!s) throw new Error('托管服务器不存在: ' + id)
    const enabled = s.enabled !== false
    const registered = enabled ? await mcpToolsRegistered(s.serverName) : false
    let probe = null
    if (enabled && wantProbe) {
      probe = s.transport === 'stdio' ? await probeStdio(s) : await probeHttp(s)
    }
    return { id, serverName: s.serverName, transport: s.transport, enabled, registered, probe }
  }

  // ---------------------------------------------------------- HTTP routes

  /** One guarded POST handler: fence → method → dispatch to fn. */
  function postRoute(path, fn) {
    return {
      kind: 'exact',
      path,
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) { writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' }); return }
        if ((req.method || 'GET') !== 'POST') { writeJson(res, 405, { ok: false, error: 'method not allowed' }); return }
        const body = await readJsonBody(req)
        try {
          const result = await fn(body || {})
          writeJson(res, 200, { ok: true, ...result })
        } catch (e) {
          writeJson(res, 200, { ok: false, error: String((e && e.message) || e) })
        }
      },
    }
  }

  const routes = [
    postRoute('/api/dsh-skill-mcp/skills/list', async () => ({ ...(await listSkills()) })),
    postRoute('/api/dsh-skill-mcp/skills/set-enabled', async (b) => ({ ...(await setSkillEnabled(String(b.name || ''), !!(b.enabled))) })),
    postRoute('/api/dsh-skill-mcp/mcp/list', async () => ({ patchPath: '~/.dsh/cordis.patch.yml', ...(await listMcp()) })),
    postRoute('/api/dsh-skill-mcp/mcp/save', async (b) => ({ ...(await saveMcpServer((b && b.server) || {})) })),
    postRoute('/api/dsh-skill-mcp/mcp/set-enabled', async (b) => ({ ...(await setMcpEnabled(String(b.id || ''), !!(b.enabled))) })),
    postRoute('/api/dsh-skill-mcp/mcp/remove', async (b) => ({ ...(await removeMcpServer(String(b.id || ''))) })),
    postRoute('/api/dsh-skill-mcp/mcp/check', async (b) => ({ ...(await checkMcpServer(String(b.id || ''), !!(b.probe))) })),
  ]

  ctx.effect(() => {
    const disposers = routes.map(route => ctx.webServer.register(route))
    return () => { for (const dispose of disposers) dispose() }
  }, 'skill-mcp-manager: routes')

  // ------------------------------------------------------------- tool

  const text = (value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  const tool = defineTool({
    name: 'skillmcp_manage',
    description: '管理 DSH 的技能（Skill）与 MCP 服务器：debug 返回环境诊断；list-skills 列出技能及启用状态；skill-set-enabled 启用/禁用技能（修改技能文件 frontmatter 的 disable-model-invocation/user-invocable）；list-mcp 列出 MCP 服务器；mcp-save 新增或更新 MCP 服务器（server 对象字段：serverName 必填（不支持自动推导）, transport: stdio|streamable-http, command, args[], env{}, cwd, url, headers{}, toolCallTimeoutMs, failOnStartupError, reconnect{enabled,initialDelayMs,maxDelayMs,maxAttempts}；serverName 自动规范化；transport 兼容 type 字段）；mcp-set-enabled 启用/禁用；mcp-remove 删除托管服务器；mcp-check 检测服务器状态（id 必填，probe 是否执行进程/连接探测，默认 true；返回 registered=工具是否已注册、probe=探测结果）。修改写入 ~/.dsh/cordis.patch.yml 或技能文件，热生效。',
    parameters: {
      action: { type: 'string', required: true, enum: ['debug', 'list-skills', 'skill-set-enabled', 'list-mcp', 'mcp-save', 'mcp-set-enabled', 'mcp-remove', 'mcp-check'], description: '要执行的操作' },
      name: { type: 'string', description: '技能名（skill-set-enabled 用）' },
      enabled: { type: 'boolean', description: 'true=启用，false=禁用' },
      id: { type: 'string', description: 'MCP 服务器 id（mcp-set-enabled / mcp-remove / mcp-check 用）' },
      server: { type: 'json', description: 'MCP 服务器配置（mcp-save 用）' },
      probe: { type: 'boolean', description: 'mcp-check 是否执行进程/连接探测（默认 true）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => text(value),
    },
    async execute(args) {
      const action = String((args && args.action) || '')
      if (action === 'debug') {
        const scope = await viewScope()
        const ws = (sandboxPolicy && sandboxPolicy.workspaceRoot) || null
        const out = {
          hasSkills: !!skills,
          hasSubprocess: !!subprocess,
          hasSandboxPolicy: !!sandboxPolicy,
          hasFs: !!fs,
          hasAgentPresets: !!agentPresets,
          workspaceRoot: ws,
          standingScope: scope,
        }
        if (skills) {
          try {
            const snap = await skills.snapshot(await skillView())
            out.snapshotScoped = { count: snap.skills.length, complete: snap.complete, names: snap.skills.slice(0, 8).map(s => s.name) }
          } catch (e) { out.snapshotScopedError = String((e && e.message) || e) }
        }
        return { ok: true, ...out }
      }
      if (action === 'list-skills') return { ok: true, ...(await listSkills()) }
      if (action === 'skill-set-enabled') return { ok: true, ...(await setSkillEnabled(String((args && args.name) || ''), !!(args && args.enabled))) }
      if (action === 'list-mcp') return { ok: true, patchPath: '~/.dsh/cordis.patch.yml', ...(await listMcp()) }
      if (action === 'mcp-save') return { ok: true, ...(await saveMcpServer((args && args.server) || {})) }
      if (action === 'mcp-set-enabled') return { ok: true, ...(await setMcpEnabled(String((args && args.id) || ''), !!(args && args.enabled))) }
      if (action === 'mcp-remove') return { ok: true, ...(await removeMcpServer(String((args && args.id) || ''))) }
      if (action === 'mcp-check') return { ok: true, ...(await checkMcpServer(String((args && args.id) || ''), (args && args.probe) !== false)) }
      throw new Error('未知 action: ' + action)
    },
  })
  ctx.effect(() => ctx.tools.register(tool), 'skill-mcp-manager: tool')

  // --------------------------------------------------- system prompt

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:skill-mcp-manager',
    order: 150,
    text: GUIDANCE,
  }), 'skill-mcp-manager: prompt')
}
