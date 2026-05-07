// backfill-auth.mjs — Adds enrichment.auth to every tool in a premade JSON
// based on the catalog's top-level auth[] array. Idempotent.
//
// Some premades (the older hand-written ones) ship with `enrichment.auth: null`
// or no enrichment at all on each tool, even though the top-level auth[]
// declares the API needs a credential. The dispatcher in backend/server.ts
// reads enrichment.auth.template per-tool to decide which credential to inject;
// without it, the tool fires unauthenticated. The downloaded server's
// .env.example also derives its env-var list from per-tool templates, so
// users get "this API requires no authentication" when it absolutely does.
//
// Maps top-level auth → per-tool enrichment exactly as
// buildEnrichmentFromAuthConfigs does in generate_tool_registry.ts.
//
// Usage: node scripts/backfill-auth.mjs

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PREMADE_DIR = path.resolve(__dirname, "../frontend/public/premade")

// Premades where the JSON's top-level auth is missing or wrong (declares
// "none" when the API actually requires a credential). Override here.
//
// Conservative list — only premades the audit explicitly flagged as needing
// auth. Postmark, openai, github are the three with `auth: [{type:"none"}]`
// in the JSON despite needing real auth. Postmark stays opt-out: its tools
// currently surface tokens as regular params (X-Postmark-Account-Token /
// X-Postmark-Server-Token), and a clean fix needs human input on which
// scope each tool uses. Surfaced in the final report instead.
const TOP_LEVEL_OVERRIDES = {
  github: [{ type: "bearer_token" }],
  openai: [{ type: "bearer_token" }],
}

/** Mirrors buildEnrichmentFromAuthConfigs in backend/generate_tool_registry.ts */
function authConfigsToEnrichment(authConfigs) {
  if (!Array.isArray(authConfigs)) return null
  const auth = authConfigs.find(a => a && a.type !== "none")
  if (!auth) return null
  switch (auth.type) {
    case "oauth2":
      return {
        template: auth.oauthFlow === "client_credentials" ? "oauth2_client_creds" : "oauth2_auth_code",
        integration_id: "",
        ...(auth.tokenUrl ? { token_url: auth.tokenUrl } : {}),
        ...(auth.authorizationUrl ? { authorization_url: auth.authorizationUrl } : {}),
      }
    case "bearer_token":
      return { template: "bearer_token", integration_id: "" }
    case "api_key":
      if (auth.in === "header") {
        return { template: "api_key_header", integration_id: "", header_name: auth.name }
      }
      if (auth.in === "query") {
        return { template: "api_key_query", integration_id: "", param_name: auth.name }
      }
      return null
    case "basic_auth":
      return { template: "basic_auth", integration_id: "" }
    default:
      return null
  }
}

function backfillOne(filePath) {
  const name = path.basename(filePath, ".json")
  const j = JSON.parse(fs.readFileSync(filePath, "utf8"))
  if (!Array.isArray(j.tools)) return { name, changed: false }

  let changedAuth = false
  if (TOP_LEVEL_OVERRIDES[name]) {
    j.auth = TOP_LEVEL_OVERRIDES[name]
    changedAuth = true
  }

  const enrichment = authConfigsToEnrichment(j.auth)
  if (!enrichment) {
    if (changedAuth) {
      fs.writeFileSync(filePath, JSON.stringify(j, null, 2))
      return { name, changed: true, enriched: 0, topLevelChanged: true }
    }
    return { name, changed: false }
  }

  let enriched = 0
  for (const tool of j.tools) {
    const existing = tool.enrichment?.auth
    if (existing && existing.template) continue
    if (!tool.enrichment) tool.enrichment = { auth: null }
    tool.enrichment.auth = { ...enrichment }
    enriched++
  }

  const changed = enriched > 0 || changedAuth
  if (changed) fs.writeFileSync(filePath, JSON.stringify(j, null, 2))
  return { name, changed, enriched, topLevelChanged: changedAuth }
}

function main() {
  const files = fs.readdirSync(PREMADE_DIR).filter(f => f.endsWith(".json")).sort()
  console.log(`Backfilling auth across ${files.length} premades`)
  console.log("")
  let totalEnriched = 0
  for (const f of files) {
    const r = backfillOne(path.join(PREMADE_DIR, f))
    if (!r.changed) {
      console.log(`  ${r.name.padEnd(20)} (no change)`)
      continue
    }
    const tag = r.topLevelChanged ? " [top-level set]" : ""
    console.log(`  ${r.name.padEnd(20)} enriched=${r.enriched ?? 0}${tag}`)
    totalEnriched += r.enriched ?? 0
  }
  console.log("")
  console.log(`Total tools enriched: ${totalEnriched}`)
}

main()
