/**
 * Build script: copies src/ to lib/ (the shipped layout the dsh loader
 * expects) and sanity-checks both halves.
 *
 *   node scripts/build.mjs
 *
 * The plugin is plain JavaScript — no transpilation. The client half is
 * already in the final `window.__ModuleLoader__.load(...)` bundle format,
 * so the build is a deterministic copy + validation step.
 */

import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const libDir = join(root, 'lib')
const require = createRequire(import.meta.url)

// 1. Clean + copy src → lib
rmSync(libDir, { recursive: true, force: true })
mkdirSync(libDir, { recursive: true })
cpSync(srcDir, libDir, { recursive: true })

// 2. Validate the host half parses and exposes the cordis contract
const host = readFileSync(join(libDir, 'index.js'), 'utf8')
if (!/export\s+function\s+apply/.test(host)) throw new Error('lib/index.js: missing export function apply')
if (!/export\s+const\s+name/.test(host)) throw new Error('lib/index.js: missing export const name')
if (!/export\s+const\s+inject/.test(host)) throw new Error('lib/index.js: missing export const inject')

// 3. Validate the client half is a ModuleLoader bundle with the plugin contract
const client = readFileSync(join(libDir, 'client.js'), 'utf8')
if (!/window\.__ModuleLoader__\.load\(\{/.test(client)) throw new Error('lib/client.js: not a ModuleLoader bundle')
if (!/exports\.apply\s*=\s*apply/.test(client)) throw new Error('lib/client.js: missing exports.apply')
if (!/exports\.inject\s*=\s*inject/.test(client)) throw new Error('lib/client.js: missing exports.inject')

console.log('build ok: lib/index.js + lib/client.js (host contract + ModuleLoader client)')
