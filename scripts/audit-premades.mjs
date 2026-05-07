// audit-premades.mjs — Generates the download zip for every premade catalog,
// inspects every file in each zip, and produces a structured report of issues
// the user (or a remediation agent) needs to fix.
//
// Usage:  node scripts/audit-premades.mjs
// Requires: backend running locally (http://localhost:8000), curl, unzip on PATH.
//
// Output: scripts/premade-audit-report.md

import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "..")
const PREMADE_DIR = path.join(REPO_ROOT, "frontend/public/premade")
const REPORT_PATH = path.join(__dirname, "premade-audit-report.md")
const API_URL = "http://localhost:8000/api/server/download"
const WORK_DIR = path.join(__dirname, ".audit-work")

// 16 audit features that must be present in every generated server.ts
const REQUIRED_SERVER_FEATURES = [
  ["assertSafeUrl", "B5 SSRF guard"],
  ["redactUrl", "O14 log redaction"],
  ["injectAuth", "O12 per-tool runtime auth"],
  ["VALID_AUTO_PATH_SOURCES", "B1 auto_path_params allowlist"],
  ["param_name_map", "B2 sanitization reversal"],
  ["body_format", "B4 form/multipart/json dispatch"],
  ["redirect: \"manual\"", "H9 redirect rejection"],
  ["encodeURIComponent", "H10 path param encoding"],
  ["evictSession", "O15 session helper"],
  ["hasMarkup", "H8 content/url dedup"],
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function downloadAndExtract(name) {
  const reg = JSON.parse(fs.readFileSync(path.join(PREMADE_DIR, name + ".json"), "utf8"))
  const body = JSON.stringify({ name, registry: reg })
  const zipFile = path.join(WORK_DIR, name + ".zip")

  // Try up to 3 times with rate-limit backoff. Backend's downloadLimiter is
  // 10/min by default — when we hit it, the response is a tiny JSON error blob
  // rather than a zip, so we wait the full minute and retry.
  let attempt = 0
  while (true) {
    attempt++
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
    if (resp.status === 429) {
      if (attempt >= 3) throw new Error(`rate-limited after ${attempt} attempts`)
      const retry = 65_000
      console.log(`    rate-limited; sleeping ${Math.round(retry / 1000)}s before retry ${attempt}`)
      await sleep(retry)
      continue
    }
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`)
    }
    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length < 200) throw new Error(`zip too small (${buf.length} bytes): ${buf.toString("utf8").slice(0, 200)}`)
    fs.writeFileSync(zipFile, buf)
    break
  }

  const extractRoot = path.join(WORK_DIR, name + "-out")
  fs.rmSync(extractRoot, { recursive: true, force: true })
  fs.mkdirSync(extractRoot, { recursive: true })
  execSync(`unzip -q -o "${zipFile}" -d "${extractRoot}"`, { stdio: "pipe" })
  // Generator nests output under specName/
  const inner = path.join(extractRoot, name)
  if (!fs.existsSync(inner)) throw new Error(`extract did not produce ${inner}`)
  return inner
}

// ─── Per-file audits ─────────────────────────────────────────────────────────

function auditServerTs(srcPath, findings) {
  const src = fs.readFileSync(srcPath, "utf8")
  const lines = src.split("\n").length
  if (lines < 200) {
    findings.push({ severity: "error", kind: "SERVER_TS_TRUNCATED", lines })
  }
  for (const [needle, desc] of REQUIRED_SERVER_FEATURES) {
    if (!src.includes(needle)) {
      findings.push({ severity: "error", kind: "MISSING_FEATURE", needle, desc })
    }
  }
}

function auditPackageJson(p, findings) {
  const j = JSON.parse(fs.readFileSync(p, "utf8"))
  const required = ["@modelcontextprotocol/sdk", "dotenv", "express", "zod"]
  for (const dep of required) {
    if (!j.dependencies?.[dep]) {
      findings.push({ severity: "error", kind: "MISSING_DEP", dep })
    }
  }
  if (!j.scripts?.start) findings.push({ severity: "error", kind: "MISSING_START_SCRIPT" })
}

function auditEnvExample(p, expectedTemplates, findings) {
  const txt = fs.readFileSync(p, "utf8")
  const expected = new Set()
  for (const tpl of expectedTemplates) {
    if (tpl === "bearer_token") expected.add("BEARER_TOKEN")
    else if (tpl === "api_key_header" || tpl === "api_key_query") expected.add("API_KEY")
    else if (tpl === "oauth2_client_creds" || tpl === "oauth2_auth_code") expected.add("ACCESS_TOKEN")
    else if (tpl === "basic_auth") expected.add("API_CREDENTIALS")
  }
  for (const v of expected) {
    if (!txt.includes(v)) findings.push({ severity: "error", kind: "ENV_MISSING_VAR", varName: v })
  }
  if (expected.size === 0 && !txt.includes("no authentication")) {
    findings.push({ severity: "warning", kind: "ENV_UNCLEAR_NO_AUTH" })
  }
}

function auditReadme(p, expectedTemplates, findings) {
  const txt = fs.readFileSync(p, "utf8")
  const hasOAuthAuthCode = expectedTemplates.has("oauth2_auth_code")
  const hasOAuthCC = expectedTemplates.has("oauth2_client_creds")
  if (hasOAuthAuthCode && !txt.includes("Authorization Code note")) {
    findings.push({ severity: "warning", kind: "README_OAUTH_AUTHCODE_MISSING" })
  }
  if (hasOAuthCC && !txt.includes("Client Credentials note")) {
    findings.push({ severity: "warning", kind: "README_OAUTH_CC_MISSING" })
  }
  if (!txt.includes("port 3333")) {
    findings.push({ severity: "warning", kind: "README_PORT_MISMATCH" })
  }
}

function auditToolsJson(p, findings) {
  const tj = JSON.parse(fs.readFileSync(p, "utf8"))
  if (!tj.baseUrl) findings.push({ severity: "warning", kind: "NO_BASE_URL" })
  if (tj.baseUrl) {
    try { new URL(tj.baseUrl) } catch { findings.push({ severity: "error", kind: "INVALID_BASE_URL", baseUrl: tj.baseUrl }) }
  }
  if (!Array.isArray(tj.tools) || tj.tools.length === 0) {
    findings.push({ severity: "error", kind: "NO_TOOLS" })
    return { templates: new Set() }
  }

  const templates = new Set()
  let toolsWithoutAuth = 0
  let bodylessMutating = []
  let unresolvablePathParams = []
  let invalidNames = []
  let requiredNotInProps = []

  for (const tool of tj.tools) {
    const tpl = tool.enrichment?.auth?.template
    if (tpl) templates.add(tpl)
    else toolsWithoutAuth++

    if (!tool.name || !/^[a-zA-Z0-9_.-]{1,64}$/.test(tool.name)) {
      invalidNames.push(tool.name || "(empty)")
    }

    if (!tool.handler?.method || !tool.handler?.path) continue

    const path_ = tool.handler.path
    const props = Object.keys(tool.input_schema?.properties || {})
    const queryParams = tool.handler.query_params || []
    const autoFilled = Object.keys(tool.handler.auto_path_params || {})
    const pathPlaceholders = (path_.match(/\{[^}]+\}/g) || []).map(s => s.slice(1, -1))

    for (const ph of pathPlaceholders) {
      if (!props.includes(ph) && !autoFilled.includes(ph)) {
        unresolvablePathParams.push({ tool: tool.name, param: ph })
      }
    }

    const required = tool.input_schema?.required || []
    for (const r of required) {
      if (!props.includes(r)) requiredNotInProps.push({ tool: tool.name, prop: r })
    }

    const mutating = ["POST", "PUT", "PATCH"].includes(tool.handler.method.toUpperCase())
    if (mutating) {
      const bodyParams = props.filter(k => !pathPlaceholders.includes(k) && !queryParams.includes(k))
      if (bodyParams.length === 0) bodylessMutating.push({ tool: tool.name, method: tool.handler.method })
    }
  }

  if (toolsWithoutAuth > 0 && templates.size > 0) {
    findings.push({ severity: "warning", kind: "PARTIAL_AUTH_COVERAGE", toolsWithoutAuth, totalTools: tj.tools.length })
  }
  if (invalidNames.length > 0) {
    findings.push({ severity: "error", kind: "INVALID_TOOL_NAMES", names: invalidNames.slice(0, 10), total: invalidNames.length })
  }
  if (unresolvablePathParams.length > 0) {
    findings.push({ severity: "error", kind: "UNRESOLVABLE_PATH_PARAMS", samples: unresolvablePathParams.slice(0, 10), total: unresolvablePathParams.length })
  }
  if (requiredNotInProps.length > 0) {
    findings.push({ severity: "error", kind: "REQUIRED_NOT_IN_PROPS", samples: requiredNotInProps.slice(0, 10), total: requiredNotInProps.length })
  }
  if (bodylessMutating.length > 0) {
    findings.push({ severity: "warning", kind: "MUTATING_NO_BODY", samples: bodylessMutating.slice(0, 15), total: bodylessMutating.length })
  }

  return {
    templates,
    toolCount: tj.tools.length,
    toolsWithoutAuth,
    bodylessCount: bodylessMutating.length,
    unresolvableCount: unresolvablePathParams.length,
    invalidNameCount: invalidNames.length,
    requiredMissingCount: requiredNotInProps.length,
  }
}

// ─── Per-premade audit ───────────────────────────────────────────────────────

async function auditOne(name) {
  const findings = []
  const stats = { name, success: false, errors: 0, warnings: 0 }

  let dir
  try {
    dir = await downloadAndExtract(name)
  } catch (e) {
    findings.push({ severity: "error", kind: "DOWNLOAD_OR_EXTRACT_FAILED", message: String(e.message || e) })
    stats.errors = findings.length
    return { findings, stats }
  }
  stats.success = true

  // Required files
  const expectedFiles = ["server.ts", "package.json", "tools.json", ".env.example", "README.md", "tsconfig.json"]
  for (const f of expectedFiles) {
    if (!fs.existsSync(path.join(dir, f))) {
      findings.push({ severity: "error", kind: "MISSING_FILE", file: f })
    }
  }

  // Per-file checks
  const toolsJsonPath = path.join(dir, "tools.json")
  let toolsStats = { templates: new Set() }
  if (fs.existsSync(toolsJsonPath)) {
    toolsStats = auditToolsJson(toolsJsonPath, findings)
  }

  if (fs.existsSync(path.join(dir, "server.ts"))) {
    auditServerTs(path.join(dir, "server.ts"), findings)
  }
  if (fs.existsSync(path.join(dir, "package.json"))) {
    auditPackageJson(path.join(dir, "package.json"), findings)
  }
  if (fs.existsSync(path.join(dir, ".env.example"))) {
    auditEnvExample(path.join(dir, ".env.example"), [...toolsStats.templates], findings)
  }
  if (fs.existsSync(path.join(dir, "README.md"))) {
    auditReadme(path.join(dir, "README.md"), toolsStats.templates, findings)
  }

  Object.assign(stats, toolsStats, {
    templates: [...toolsStats.templates],
    errors: findings.filter(f => f.severity === "error").length,
    warnings: findings.filter(f => f.severity === "warning").length,
  })

  return { findings, stats }
}

// ─── Report builder ──────────────────────────────────────────────────────────

function buildReport(results) {
  const lines = []
  lines.push("# Premade Audit Report")
  lines.push("")
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push("")

  // Summary
  const totalErrors = results.reduce((a, r) => a + r.stats.errors, 0)
  const totalWarnings = results.reduce((a, r) => a + r.stats.warnings, 0)
  const failed = results.filter(r => !r.stats.success).map(r => r.stats.name)
  const clean = results.filter(r => r.stats.success && r.stats.errors === 0 && r.stats.warnings === 0).map(r => r.stats.name)

  lines.push("## Summary")
  lines.push("")
  lines.push(`- Premades audited: **${results.length}**`)
  lines.push(`- Total errors:     **${totalErrors}**`)
  lines.push(`- Total warnings:   **${totalWarnings}**`)
  lines.push(`- Failed to download/extract: **${failed.length}** ${failed.length ? `(${failed.join(", ")})` : ""}`)
  lines.push(`- Completely clean: **${clean.length}** ${clean.length ? `(${clean.join(", ")})` : ""}`)
  lines.push("")

  // Cross-cutting issues — group by kind, count occurrences
  const byKind = new Map()  // kind -> [{ premade, finding }]
  for (const r of results) {
    for (const f of r.findings) {
      const arr = byKind.get(f.kind) || []
      arr.push({ premade: r.stats.name, finding: f })
      byKind.set(f.kind, arr)
    }
  }

  lines.push("## Issues grouped by kind (severity-sorted)")
  lines.push("")
  const sortedKinds = [...byKind.entries()].sort((a, b) => {
    const sa = a[1][0].finding.severity === "error" ? 0 : 1
    const sb = b[1][0].finding.severity === "error" ? 0 : 1
    if (sa !== sb) return sa - sb
    return b[1].length - a[1].length
  })
  for (const [kind, arr] of sortedKinds) {
    const sev = arr[0].finding.severity.toUpperCase()
    lines.push(`### [${sev}] ${kind} — affects ${arr.length} premade(s)`)
    lines.push("")
    for (const { premade, finding } of arr) {
      const detail = formatFindingDetail(finding)
      lines.push(`- **${premade}**${detail ? ` — ${detail}` : ""}`)
    }
    lines.push("")
  }

  // Per-premade table
  lines.push("## Per-premade overview")
  lines.push("")
  lines.push("| Premade | Tools | Auth template(s) | No-auth | Bodyless mut. | Unresolvable path | Errors | Warnings |")
  lines.push("|---|---|---|---|---|---|---|---|")
  for (const r of results) {
    const s = r.stats
    if (!s.success) {
      lines.push(`| ${s.name} | (download failed) | – | – | – | – | ${s.errors} | ${s.warnings} |`)
      continue
    }
    const tpls = (s.templates || []).join(", ") || "(none)"
    lines.push(`| ${s.name} | ${s.toolCount ?? 0} | ${tpls} | ${s.toolsWithoutAuth ?? 0} | ${s.bodylessCount ?? 0} | ${s.unresolvableCount ?? 0} | ${s.errors} | ${s.warnings} |`)
  }
  lines.push("")

  return lines.join("\n")
}

function formatFindingDetail(f) {
  const parts = []
  if (f.dep) parts.push(`dep: \`${f.dep}\``)
  if (f.file) parts.push(`file: \`${f.file}\``)
  if (f.varName) parts.push(`env var: \`${f.varName}\``)
  if (f.baseUrl) parts.push(`baseUrl: \`${f.baseUrl}\``)
  if (f.lines !== undefined) parts.push(`lines: ${f.lines}`)
  if (f.needle) parts.push(`missing: \`${f.needle}\` (${f.desc})`)
  if (f.toolsWithoutAuth !== undefined) parts.push(`${f.toolsWithoutAuth}/${f.totalTools} tools have no auth enrichment`)
  if (f.total !== undefined) {
    parts.push(`**${f.total} occurrence(s)**`)
    if (f.samples) {
      const sample = f.samples.slice(0, 5).map(s => typeof s === "string" ? s : (s.tool ? `\`${s.tool}\`${s.param ? `[${s.param}]` : s.method ? ` (${s.method})` : s.prop ? ` (req: ${s.prop})` : ""}` : JSON.stringify(s))).join(", ")
      parts.push(`samples: ${sample}${f.samples.length > 5 ? "..." : ""}`)
    }
    if (f.names) {
      parts.push(`names: ${f.names.slice(0, 5).map(n => `\`${n}\``).join(", ")}${f.names.length > 5 ? "..." : ""}`)
    }
  }
  if (f.message) parts.push(`message: ${f.message.slice(0, 200)}`)
  if (f.note) parts.push(f.note)
  return parts.join("; ")
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Sanity: backend must be up. Use Node's fetch (built-in 18+) so we don't
  // depend on whichever curl / shell mix execSync resolves on Windows.
  try {
    const resp = await fetch("http://localhost:8000/api/health")
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  } catch (e) {
    console.error(`Backend not reachable at http://localhost:8000 (${e.message}) — start it first (cd backend && npm start).`)
    process.exit(1)
  }

  fs.rmSync(WORK_DIR, { recursive: true, force: true })
  fs.mkdirSync(WORK_DIR, { recursive: true })

  const premades = fs.readdirSync(PREMADE_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(/\.json$/, ""))
    .sort()

  console.log(`Auditing ${premades.length} premades...`)
  const results = []
  for (const name of premades) {
    process.stdout.write(`  ${name}... `)
    const r = await auditOne(name)
    r.stats.name = name
    results.push(r)
    console.log(`${r.stats.errors} errors, ${r.stats.warnings} warnings`)
  }

  const report = buildReport(results)
  fs.writeFileSync(REPORT_PATH, report)
  console.log("")
  console.log(`Report written to ${REPORT_PATH}`)
  console.log(`Totals: ${results.reduce((a, r) => a + r.stats.errors, 0)} errors, ${results.reduce((a, r) => a + r.stats.warnings, 0)} warnings`)
}

main().catch(e => { console.error(e); process.exit(1) })
