// patch-premades.mjs — Applies the same fixes the parser now performs to every
// existing premade JSON. Idempotent — re-running is safe.
//
// Each fix mirrors a parser change in backend/generate_tool_registry.ts:
//   --names          Tool names > 64 chars → 55 chars + "_" + 8-char SHA-1.
//                    Collisions get a second hash of method+path appended.
//   --paths          Path placeholders `{x}` not in input_schema.properties get
//                    auto-promoted to a required string property.
//   --required       required[] entries that don't reference an actual property
//                    get dropped.
//   --all            All of the above.
//
// Usage: node scripts/patch-premades.mjs --names
//        node scripts/patch-premades.mjs --paths
//        node scripts/patch-premades.mjs --required
//        node scripts/patch-premades.mjs --all

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PREMADE_DIR = path.resolve(__dirname, "../frontend/public/premade")

const args = new Set(process.argv.slice(2))
const FIX_NAMES    = args.has("--names")    || args.has("--all")
const FIX_PATHS    = args.has("--paths")    || args.has("--all")
const FIX_REQUIRED = args.has("--required") || args.has("--all")
if (!(FIX_NAMES || FIX_PATHS || FIX_REQUIRED)) {
  console.error("Specify at least one of: --names --paths --required --all")
  process.exit(1)
}

const ANTHROPIC_TOOL_NAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/

function sha1(s) { return crypto.createHash("sha1").update(s).digest("hex") }

function sanitizeToolName(original) {
  if (ANTHROPIC_TOOL_NAME_RE.test(original)) return original
  let cleaned = original.replace(/[^a-zA-Z0-9_.-]+/g, "_")
  if (cleaned.length > 64) {
    const tag = sha1(original).slice(0, 8)
    cleaned = cleaned.slice(0, 55) + "_" + tag // 55 + 1 + 8 = 64
  }
  if (cleaned.length === 0) cleaned = "tool_" + sha1(original).slice(0, 8)
  return cleaned
}

function patchOne(filePath) {
  const j = JSON.parse(fs.readFileSync(filePath, "utf8"))
  if (!Array.isArray(j.tools)) return { changed: false, name: path.basename(filePath, ".json") }

  const stats = { renamed: 0, injected: 0, droppedRequired: 0, collisions: 0 }
  const namesSeen = new Set()

  for (const tool of j.tools) {
    if (FIX_NAMES) {
      const original = tool.name || ""
      let next = sanitizeToolName(original)
      if (namesSeen.has(next)) {
        const tag = sha1(`${tool.handler?.method || ""}:${tool.handler?.path || ""}`).slice(0, 8)
        const base = next.length > 55 ? next.slice(0, 55) : next
        next = `${base}_${tag}`
        stats.collisions++
      }
      namesSeen.add(next)
      if (next !== original) {
        tool.name = next
        stats.renamed++
      }
    }

    if (FIX_PATHS) {
      const handler = tool.handler || {}
      const path_ = handler.path || ""
      if (!tool.input_schema) tool.input_schema = { type: "object", properties: {}, required: [] }
      if (!tool.input_schema.properties) tool.input_schema.properties = {}
      if (!Array.isArray(tool.input_schema.required)) tool.input_schema.required = []
      const props = tool.input_schema.properties
      const required = tool.input_schema.required
      const autoPath = new Set(Object.keys(handler.auto_path_params || {}))
      const placeholders = path_.match(/\{[^}]+\}/g) || []
      for (const ph of placeholders) {
        const phName = ph.slice(1, -1)
        if (autoPath.has(phName)) continue
        if (props[phName] !== undefined) continue
        props[phName] = {
          type: "string",
          description: `Path parameter \`${phName}\` (auto-injected; not declared in spec).`,
        }
        if (!required.includes(phName)) required.push(phName)
        stats.injected++
      }
    }

    if (FIX_REQUIRED) {
      const props = tool.input_schema?.properties || {}
      const required = tool.input_schema?.required || []
      const before = required.length
      tool.input_schema.required = required.filter(k => props[k] !== undefined)
      stats.droppedRequired += before - tool.input_schema.required.length
    }
  }

  const changed = stats.renamed + stats.injected + stats.droppedRequired > 0
  if (changed) fs.writeFileSync(filePath, JSON.stringify(j, null, 2))
  return {
    name: path.basename(filePath, ".json"),
    changed,
    ...stats,
  }
}

function main() {
  const files = fs.readdirSync(PREMADE_DIR).filter(f => f.endsWith(".json")).sort()
  console.log(`Patching ${files.length} premades in ${PREMADE_DIR}`)
  console.log(`Fixes: names=${FIX_NAMES} paths=${FIX_PATHS} required=${FIX_REQUIRED}`)
  console.log("")
  let totalRenamed = 0, totalInjected = 0, totalDropped = 0, totalCollisions = 0
  for (const f of files) {
    const r = patchOne(path.join(PREMADE_DIR, f))
    if (!r.changed) {
      console.log(`  ${r.name.padEnd(20)} (clean)`)
      continue
    }
    console.log(`  ${r.name.padEnd(20)} renamed=${r.renamed}  injected=${r.injected}  droppedRequired=${r.droppedRequired}  collisions=${r.collisions}`)
    totalRenamed += r.renamed
    totalInjected += r.injected
    totalDropped += r.droppedRequired
    totalCollisions += r.collisions
  }
  console.log("")
  console.log(`Totals: renamed=${totalRenamed}  injected=${totalInjected}  droppedRequired=${totalDropped}  collisions=${totalCollisions}`)
}

main()
