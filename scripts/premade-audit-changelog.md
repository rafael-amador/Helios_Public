# Premade Audit Changelog

Tracks remediation work against `scripts/premade-audit-report.md`. The audit
script overwrites the report on each run, so persistent fix notes live here
instead.

## 2026-05-07 — Tier 1 + Tier 2 remediation pass

Run target: 25 errors / 21 warnings → 0 errors / 21 warnings, 16 → 20 clean
premades.

### Parser changes (`backend/generate_tool_registry.ts`)

1. **Tool name truncation.** New `sanitizeToolName()` enforces Anthropic's
   `^[a-zA-Z0-9_.-]{1,64}$` regex on tool names. Names > 64 chars truncate to
   55 chars + `_` + 8-char SHA-1 of the original. `parseOpenApiSpec` tracks
   a registry-wide `toolNamesSeen` set so post-truncation collisions get a
   second hash of method+path appended.
2. **Auto-promote unresolvable path placeholders.** `buildFromOpenApiParams`
   now scans `path` for `{x}` placeholders and injects any not already in
   `properties` as required string params. Skips placeholders covered by
   `auto_path_params` (auth-derived).
3. **Filter required[].** `sanitizeInputSchemaKeys` now drops entries from
   `required` that don't reference an actual property — closes the spec-bug
   class where APIs list a removed param as required (Figma, Spotify, Github).

### Premade JSON patches (mirrored from parser changes)

Existing premades couldn't be regenerated from spec (only Twilio's spec URL is
in `regen-premade.ts`), so `scripts/patch-premades.mjs` applies the same logic
in-place. Idempotent. Three flags: `--names`, `--paths`, `--required`, `--all`.

| Premade       | Names renamed | Paths injected | Required dropped |
|---------------|--------------:|---------------:|-----------------:|
| algolia       |             0 |             48 |                0 |
| asana         |             0 |            138 |                0 |
| box           |            12 |              0 |                1 |
| circleci      |             0 |             85 |                0 |
| cloudflare    |           108 |            338 |                2 |
| digitalocean  |             0 |            329 |                1 |
| discord       |             0 |            320 |                0 |
| figma         |             0 |              0 |                1 |
| github        |            25 |           2094 |                2 |
| gitlab        |           113 |              0 |                0 |
| mongodb       |             0 |            474 |                0 |
| notion        |             0 |             13 |                0 |
| pagerduty     |             0 |            434 |                0 |
| spotify       |             0 |             29 |                2 |
| stripe        |             5 |              0 |                0 |
| trello        |             2 |            139 |                0 |
| vercel        |             6 |              0 |                0 |
| zoom          |             0 |             24 |                0 |
| **Total**     |       **271** |       **4465** |            **9** |

### Auth backfill (Tier 2)

`scripts/backfill-auth.mjs` reads each catalog's top-level `auth[]` and writes
matching `enrichment.auth` blocks onto every tool missing one. Uses the same
mapping as `buildEnrichmentFromAuthConfigs`. 1288 tools enriched.

| Premade       | Tools enriched | Top-level auth set |
|---------------|---------------:|--------------------|
| airtable      |             15 |                    |
| github        |           1112 | yes (bearer_token) |
| google_maps   |             10 |                    |
| linear        |              5 |                    |
| newsapi       |              3 |                    |
| openai        |             28 | yes (bearer_token) |
| openweathermap|              9 |                    |
| perplexity    |              1 |                    |
| reddit        |             17 |                    |
| sendgrid      |             19 |                    |
| tmdb          |             27 |                    |
| todoist       |             19 |                    |
| twitter       |              5 |                    |
| unsplash      |             15 |                    |
| wolfram_alpha |              3 |                    |

### Deferred / not-fixed

- **MUTATING_NO_BODY (21 warnings)** — Tier 1 #3 from the prompt
  (strengthen $ref body extraction). The current parser already follows
  `$ref` via `resolveSchema`, so the cause for the remaining bodyless
  mutating tools isn't a missing dereferencer — it's likely (a) `oneOf`/
  `anyOf` request bodies where no branch has direct `properties`,
  (b) content types outside the json/form/multipart triple the extractor
  scans, or (c) genuine no-body endpoints (Twilio trash, Spotify
  play/pause, Todoist close/reopen). Diagnosing each case needs the
  original specs and per-API knowledge — deferred for a follow-up pass.

- **Postmark auth.** Catalog ships with `auth: [{type:"none"}]` but every
  tool surfaces `X-Postmark-Server-Token` or `X-Postmark-Account-Token`
  as a regular input param. The right fix is to switch to
  `api_key_header` enrichment + remove the token param from each tool's
  `input_schema.properties`, but the choice between Server-Token and
  Account-Token depends on each tool's scope. Not safe to bulk-patch.

- **Supabase NO_BASE_URL.** Catalog has empty `baseUrl`. Needs
  `https://api.supabase.com` set manually (or the upstream spec
  inspected).

- **Audit warnings on `mongodb`** — the audit reports 0 bodyless
  mutating tools after the remediation pass; previous `mongodb` 1-error
  flag was UNRESOLVABLE_PATH_PARAMS, now resolved.
