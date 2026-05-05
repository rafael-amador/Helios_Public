// API server — port 8000.
//
// Demo build: NO database, NO auth. The frontend brings:
//   - x-anthropic-key header on every AI-bound request
//   - provider credentials map (sandbox/try start) — kept in MCP-server memory
//     keyed by sessionId, evicted on session expiry, never persisted
//
// Stateless: every request carries everything it needs.

import dotenv from "dotenv"
dotenv.config({ override: true })

import express, { Request, Response, NextFunction } from "express"
import cors from "cors"
import helmet from "helmet"
import rateLimit from "express-rate-limit"

import { generateToolRegistry, parseSwaggerUrl, buildEnrichmentFromAuthConfigs } from "./generate_tool_registry.ts"
import type { AuthConfig } from "./generate_tool_registry.ts"
import { filterToolsByIntent } from "./filterToolsByIntent.ts"
import { generateServerZip } from "./generator.ts"
import { initializeAgent, callTool, messageAI } from "./sandbox.ts"
import { assertSafeUrl } from "./ssrfGuard.ts"

const app = express()

// Trust the single hop in front of us (Render LB, Vercel proxy, etc.) so
// express-rate-limit can read the real client IP from X-Forwarded-For instead
// of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. "1" means trust exactly one
// hop — safer than `true` (which trusts any number, allowing IP spoofing if
// the platform ever changes its hop count).
app.set("trust proxy", 1)

// ─── Security middleware ───────────────────────────────────────────────────────

app.use(helmet({
    // Helios is API-only — strict CSP / cross-origin policies are unnecessary
    // and can break the demo's frontend fetch flow when deployed cross-origin.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
}))

// CORS — locked to FRONTEND_ORIGIN env. In dev defaults to localhost:3001.
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3001"
app.use(cors({
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-anthropic-key"],
}))

// Body limits: spec parse may need ~5MB for large OpenAPI docs; chat is far smaller.
app.use(express.json({ limit: "5mb" }))

// Rate limit — per-IP. AI-bound routes are expensive; cap them tighter.
// Rate limit windows are best-effort under cold starts (fresh process = fresh
// counter), but they meaningfully cap sustained abuse.
const aiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many AI requests. Wait a minute and retry." },
})

const parseLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many spec parse requests. Wait a minute and retry." },
})

const downloadLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many downloads. Wait a minute and retry." },
})

// ─── BYOK middleware ───────────────────────────────────────────────────────────
// Reads x-anthropic-key from the request and stuffs it onto req. Refuses if
// missing. Anthropic key prefix is sk-ant-* — quick shape check rejects junk
// without spending an API call.

interface ByokRequest extends Request {
    anthropicKey?: string
}

function requireAnthropicKey(req: ByokRequest, res: Response, next: NextFunction) {
    const key = req.headers["x-anthropic-key"]
    if (!key || typeof key !== "string" || !key.trim()) {
        return res.status(401).json({ error: "Missing x-anthropic-key header. Configure your Anthropic API key in the demo first." })
    }
    if (!/^sk-ant-/.test(key.trim())) {
        return res.status(400).json({ error: "x-anthropic-key does not look like a valid Anthropic key (expected sk-ant-* prefix)." })
    }
    req.anthropicKey = key.trim()
    next()
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toOpenAITool(tool: any, enabled = true) {
    return {
        type: "function" as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
        },
        handler: {
            method: tool.handler.method,
            path: tool.handler.path,
            query_params: tool.handler.query_params ?? [],
            fixed_query_params: tool.handler.fixed_query_params,
            param_name_map: tool.handler.param_name_map,
            body_format: tool.handler.body_format,
            auto_path_params: tool.handler.auto_path_params,
        },
        // Enrichment carries the auth template + integration_id. Without it the
        // round-trip through frontend → sandbox → verify → download loses the
        // auth metadata, so the downloaded server's .env.example claims no
        // credentials are needed and the /try Keys panel has no integrations
        // to surface.
        enrichment: tool.enrichment,
        enabled
    }
}

function toAnthropicTool(tool: any) {
    return {
        name: tool.function.name,
        description: tool.function.description ?? "",
        input_schema: tool.function.parameters ?? { type: "object", properties: {} }
    }
}

// Anthropic rejects any input_schema property key that doesn't match
// ^[a-zA-Z0-9_.-]{1,64}$. Some catalogs (e.g. specs with `page[number]` params)
// pass through with brackets intact, killing the whole chat call.
//
// We rewrite invalid keys to safe ones, build a per-tool reverse map, and
// re-rename Claude's tool_use args back to the originals before they hit
// the dispatcher. Required[] is updated to match.
const VALID_KEY_RE = /^[a-zA-Z0-9_.-]{1,64}$/
function sanitizeKey(key: string): string {
    let safe = key.replace(/[^a-zA-Z0-9_.-]/g, "_")
    if (safe.length === 0) safe = "_"
    if (safe.length > 64) safe = safe.slice(0, 64)
    return safe
}

interface SanitizedTool {
    tool: any                              // the Anthropic-shaped tool with safe keys
    paramMap?: Record<string, string>      // safe → original (only present when renames happened)
}

function sanitizeAnthropicTool(tool: any): SanitizedTool {
    const schema = tool.input_schema
    if (!schema || !schema.properties || typeof schema.properties !== "object") return { tool }

    const renames: Array<[string, string]> = []  // [original, safe]
    const used = new Set<string>()
    for (const k of Object.keys(schema.properties)) {
        if (VALID_KEY_RE.test(k)) { used.add(k); continue }
        let safe = sanitizeKey(k)
        // Avoid colliding with an already-used key (sanitized or not)
        let n = 1
        const base = safe
        while (used.has(safe)) safe = `${base.slice(0, 60)}_${n++}`
        used.add(safe)
        renames.push([k, safe])
    }

    if (renames.length === 0) return { tool }

    const newProps: Record<string, any> = {}
    const paramMap: Record<string, string> = {}
    const renameMap = new Map(renames)
    for (const [k, v] of Object.entries(schema.properties)) {
        const safe = renameMap.get(k) ?? k
        newProps[safe] = v
        if (renameMap.has(k)) paramMap[safe] = k
    }
    const newRequired = Array.isArray(schema.required)
        ? schema.required.map((k: string) => renameMap.get(k) ?? k)
        : schema.required

    return {
        tool: {
            ...tool,
            input_schema: { ...schema, properties: newProps, required: newRequired },
        },
        paramMap,
    }
}

// Reverse-rename Claude's tool_use args back to the original property names
// so the dispatcher (which knows nothing about our sanitization) gets the
// names the underlying API expects.
function applyParamMap(args: Record<string, any>, paramMap?: Record<string, string>): Record<string, any> {
    if (!paramMap) return args
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(args)) out[paramMap[k] ?? k] = v
    return out
}

function aggregateAuthMap(authMap: Record<string, AuthConfig[]>): AuthConfig[] {
    const out: AuthConfig[] = []
    for (const configs of Object.values(authMap ?? {})) {
        for (const c of configs ?? []) {
            if (c && c.type !== "none") out.push(c)
        }
    }
    return out.length > 0 ? out : [{ type: "none" }]
}

function buildAuthContext(registry: any): Record<string, string> {
    const authContextObj: Record<string, string> = {}
    const registryAuth: AuthConfig[] = registry.auth ?? []
    for (const a of registryAuth) {
        if (a.type === "oauth2") {
            if (a.authorizationUrl) authContextObj.oauth2Url = a.authorizationUrl
            if (a.tokenUrl) authContextObj.tokenUrl = a.tokenUrl
        } else if (a.type === "basic_auth") {
            authContextObj.basicAuthNote = "Enter your credentials as \"username:password\" in the Keys panel."
        } else if (a.type === "api_key" || a.type === "bearer_token") {
            authContextObj.apiKeyNote = a.type
        }
    }
    return authContextObj
}

// Builds a registry from frontend-supplied input. No DB path — only direct
// `toolsRegistry` (composite) or `spec` (single) are accepted.
function buildMcpRegistryFromBody(body: any):
    | { ok: true; registry: any; frontendTools: any[]; groupMap?: Record<string, string>; authMap?: Record<string, AuthConfig[]> }
    | { ok: false; status: number; error: string } {

    let registry: any = null
    let frontendTools: any[] | null = null
    let outGroupMap: Record<string, string> | undefined
    let outAuthMap: Record<string, AuthConfig[]> | undefined

    try {
        if (body.toolsRegistry) {
            const reg = body.toolsRegistry
            if (!Array.isArray(reg.tools) || reg.tools.length === 0) {
                return { ok: false, status: 400, error: "toolsRegistry must have a non-empty tools array" }
            }
            const invalid = reg.tools.find((t: any) => !t.name || !t.handler?.method || !t.handler?.path)
            if (invalid) {
                return { ok: false, status: 400, error: `Tool "${invalid.name || "unknown"}" is missing required fields (name, handler.method, handler.path)` }
            }

            registry = reg
            const groupMap: Record<string, string> = body.groupMap ?? {}
            const authMap: Record<string, AuthConfig[]> = body.authMap ?? {}
            registry = {
                ...registry,
                tools: registry.tools.map((tool: any) => {
                    const groupName = groupMap[tool.name]
                    let enrichment = tool.enrichment
                    if (!enrichment) {
                        const authConfigs: AuthConfig[] = authMap[groupName] ?? [{ type: "none" }]
                        enrichment = buildEnrichmentFromAuthConfigs(authConfigs)
                    }
                    if (enrichment && enrichment.auth && groupName) {
                        enrichment.auth.integration_id = groupName
                    }
                    return { ...tool, enrichment }
                }),
                auth: aggregateAuthMap(authMap),
            }
            frontendTools = body.toolsRegistry.tools.map((tool: any) => toOpenAITool(tool))
            if (Object.keys(groupMap).length > 0) outGroupMap = groupMap
            if (Object.keys(authMap).length > 0) outAuthMap = authMap
        } else if (body.spec) {
            // generateToolRegistry is async (parses + may resolve refs)
            // Call sites must await this branch's caller.
            // We resolve synchronously here since generateToolRegistry returns a Promise —
            // see the caller wrapping in async. Handled by returning a thenable shape.
            return { ok: false, status: 500, error: "Internal: spec branch must be handled in async caller" }
        } else {
            return { ok: false, status: 400, error: "Provide toolsRegistry (composite) or spec (single API)." }
        }
    } catch (err: any) {
        return { ok: false, status: 400, error: "Failed to build registry: " + err.message }
    }

    return {
        ok: true,
        registry,
        frontendTools: frontendTools ?? registry.tools.map((tool: any) => toOpenAITool(tool)),
        groupMap: outGroupMap,
        authMap: outAuthMap
    }
}

async function buildMcpRegistryAsync(body: any) {
    if (body.spec) {
        try {
            let registry = await generateToolRegistry(body.spec)
            if (!registry.baseUrl && body.baseUrl) {
                registry = { ...registry, baseUrl: body.baseUrl }
            }
            const integrationId = body.integrationId || "default"
            registry.tools = registry.tools.map((tool: any) => {
                if (tool.enrichment && tool.enrichment.auth) {
                    tool.enrichment.auth.integration_id = integrationId
                }
                return tool
            })
            return {
                ok: true as const,
                registry,
                frontendTools: registry.tools.map((tool: any) => toOpenAITool(tool)),
            }
        } catch (err: any) {
            return { ok: false as const, status: 400, error: "Failed to load spec: " + err.message }
        }
    }
    return buildMcpRegistryFromBody(body)
}

// Rolling history window — same bookkeeping as before.
function createRollingHistory(history: any[], maxChars: number) {
    const lenOf = (entry: any): number => {
        const raw = entry?.content
        if (raw === undefined) return 0
        if (typeof raw === "string") return raw.length
        try { return (JSON.stringify(raw) ?? "").length } catch { return 0 }
    }

    const view: any[] = []
    let chars = 0

    for (let i = history.length - 1; i >= 0; i--) {
        const entryLen = lenOf(history[i])
        if (chars + entryLen > maxChars && view.length >= 2) break
        view.unshift(history[i])
        chars += entryLen
    }

    return {
        view,
        push(entry: any) {
            history.push(entry)
            view.push(entry)
            chars += lenOf(entry)
            while (chars > maxChars && view.length > 2) {
                const dropped = view.shift()
                chars -= lenOf(dropped)
            }
        }
    }
}

// ─── Routes ────────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ ok: true }))

// Spec parse — turns an OpenAPI spec (URL or raw JSON) into a tool catalog.
app.post("/api/spec/parse", parseLimiter, async (req, res) => {
    let spec: any

    if (req.body.spec) {
        spec = req.body.spec
    } else if (req.body.url) {
        // SSRF guard — reject internal/private/loopback hosts BEFORE the parser
        // touches the URL. Defense-in-depth: even though the parser-level fetch
        // is sandboxed, a malicious internal host could still leak data via
        // response timing or partial parse echo into the `spec` field.
        try {
            assertSafeUrl(String(req.body.url))
        } catch (err: any) {
            return res.status(400).json({ error: `Refused to fetch spec URL: ${err.message}` })
        }
        try {
            spec = await parseSwaggerUrl(req.body.url)
        } catch {
            return res.status(400).json({ error: "Invalid spec URL — could not fetch or parse" })
        }
    } else {
        return res.status(400).json({ error: "Either url or spec is required" })
    }

    let registry: any
    try {
        registry = await generateToolRegistry(spec)
    } catch (err: any) {
        return res.status(400).json({ error: "Failed to generate tool registry: " + err.message })
    }

    const catalog = registry.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        enabled: true,
        input_schema: tool.input_schema,
        handler: tool.handler,
        enrichment: tool.enrichment
    }))

    let baseUrl = registry.baseUrl
    if (!baseUrl && req.body.url) {
        try { baseUrl = new URL(req.body.url).origin } catch {}
    }

    res.json({
        spec,
        baseUrl,
        toolCount: registry.tools.length,
        catalog,
        auth: registry.auth
    })
})

// Spec simplify — filter a parsed catalog down to tools matching user intent (uses Anthropic).
app.post("/api/spec/simplify", aiLimiter, requireAnthropicKey, async (req: ByokRequest, res) => {
    const { catalog, userIntent } = req.body
    if (!Array.isArray(catalog) || catalog.length === 0) {
        return res.status(400).json({ error: "catalog must be a non-empty array" })
    }
    if (!userIntent || typeof userIntent !== "string" || !userIntent.trim()) {
        return res.status(400).json({ error: "userIntent must be a non-empty string" })
    }
    try {
        const result = await filterToolsByIntent(req.anthropicKey!, { schema_version: 2, baseUrl: "", tools: catalog, auth: [] }, userIntent.trim())
        res.json({ catalog: result.tools })
    } catch (err: any) {
        res.status(500).json({ error: "Failed to simplify catalog: " + err.message })
    }
})

// Sandbox start — non-GET methods are simulated, GETs hit the real API.
app.post("/api/sandbox/start", parseLimiter, async (req, res) => {
    const built = await buildMcpRegistryAsync(req.body)
    if (!built.ok) return res.status(built.status).json({ error: built.error })

    const credentials: Record<string, string> = (req.body.credentials && typeof req.body.credentials === "object")
        ? req.body.credentials
        : {}

    let sessionId: string
    try {
        sessionId = await initializeAgent(built.registry, credentials, false)
    } catch (err: any) {
        return res.status(500).json({ error: "Failed to start MCP session: " + err.message })
    }
    const authContextObj = buildAuthContext(built.registry)
    res.json({
        sessionId,
        tools: built.frontendTools,
        baseUrl: built.registry.baseUrl ?? "",
        authContext: Object.keys(authContextObj).length > 0 ? authContextObj : undefined,
        groupMap: built.groupMap,
        authMap: built.authMap,
    })
})

// Try start — every method executes live (production-mode session).
app.post("/api/try/start", parseLimiter, async (req, res) => {
    const built = await buildMcpRegistryAsync(req.body)
    if (!built.ok) return res.status(built.status).json({ error: built.error })

    const credentials: Record<string, string> = (req.body.credentials && typeof req.body.credentials === "object")
        ? req.body.credentials
        : {}

    let sessionId: string
    try {
        sessionId = await initializeAgent(built.registry, credentials, true)
    } catch (err: any) {
        return res.status(500).json({ error: "Failed to start MCP session: " + err.message })
    }
    const authContextObj = buildAuthContext(built.registry)
    res.json({
        sessionId,
        tools: built.frontendTools,
        baseUrl: built.registry.baseUrl ?? "",
        authContext: Object.keys(authContextObj).length > 0 ? authContextObj : undefined,
        groupMap: built.groupMap,
        authMap: built.authMap,
    })
})

// Sandbox chat — Claude tool-calling loop with simulation for non-GET.
app.post("/api/sandbox/chat", aiLimiter, requireAnthropicKey, async (req: ByokRequest, res) => {
    const MAX_ITERATIONS = 10
    const TOKEN_BUDGET = 60000
    const MAX_RESPONSE_CHARS = 2000

    const sessionId = req.body.sessionId
    if (!sessionId || typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/.test(sessionId)) {
        return res.status(400).json({ error: "Invalid or missing sessionId" })
    }
    if (!req.body.message || typeof req.body.message !== "string") {
        return res.status(400).json({ error: "message must be a non-empty string" })
    }
    if (!Array.isArray(req.body.history)) {
        return res.status(400).json({ error: "history must be an array" })
    }
    if (!Array.isArray(req.body.tools)) {
        return res.status(400).json({ error: "tools must be an array" })
    }
    if (req.body.history.length > 200) {
        return res.status(400).json({ error: "Conversation history is too long. Please start a new session." })
    }
    if (String(req.body.message).length > 10_000) {
        return res.status(400).json({ error: "Message is too long (max 10000 characters)." })
    }

    const history: any[] = req.body.history
    const historyBaseLen = history.length
    history.push({ role: "user", content: req.body.message })

    const rawTools = (req.body.tools ?? [])
        .filter((t: any) => t.function?.name)
        .map(toAnthropicTool)
    const sanitized = rawTools.map(sanitizeAnthropicTool)
    const anthropicTools = sanitized.map((s: SanitizedTool) => s.tool)
    // tool name → reverse-rename map for tool_use args
    const paramMapByTool: Record<string, Record<string, string> | undefined> = {}
    sanitized.forEach((s: SanitizedTool) => { paramMapByTool[s.tool.name] = s.paramMap })

    const sanitizePromptField = (s: string) => s.replace(/[\n\r`]/g, " ").slice(0, 300)

    const authHints: string[] = []
    const authContext = req.body.authContext as { oauth2Url?: string; tokenUrl?: string; basicAuthNote?: string } | undefined
    if (authContext?.oauth2Url) {
        authHints.push(`This API uses OAuth 2.0. If the user does not have an access token yet, tell them to visit ${sanitizePromptField(authContext.oauth2Url)} and paste the resulting access_token into the Keys panel.`)
    }
    if (authContext?.tokenUrl && !authContext?.oauth2Url) {
        authHints.push(`This API uses OAuth 2.0 Client Credentials. If a tool returns 401, the user must POST to ${sanitizePromptField(authContext.tokenUrl)} with their client_id and client_secret, then paste the resulting access_token into the Keys panel.`)
    }
    if (authContext?.basicAuthNote) {
        authHints.push(`This API uses Basic Auth. ${sanitizePromptField(authContext.basicAuthNote)}`)
    }
    const credentialPolicy = ` CREDENTIAL POLICY: All API credentials are auto-injected into outgoing requests by the dispatcher from the user's session. You NEVER ask for credentials and NEVER echo them. If the user volunteers a credential in chat, instruct them to save it in the Keys panel instead. Only when a tool returns 401/403 should you tell the user their credential is missing or invalid.`
    const authInstruction = credentialPolicy + (authHints.length > 0 ? ` AUTH CONTEXT: ${authHints.join(" ")}` : "")

    const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

    const systemContent = `Today's date is ${todayStr}. You are a sandbox testing assistant for API tools. Always call the appropriate tool for every user request — including POST, PUT, PATCH, and DELETE operations. GET requests return real data from the live API. POST, PUT, PATCH, and DELETE requests are intercepted by the sandbox: the tool never touches the real API and instead returns a simulation of what would have been sent. When you receive a sandbox_simulation response, you are done — present the simulated_request to the user as a success and stop immediately. Do not call the same tool again. Never describe a simulation as an error. CONTENT FIELDS ARE THE DELIVERABLE: when a tool parameter accepts user-facing content (message bodies, email bodies, SMS text, TwiML scripts), put the COMPLETE substantive content in that parameter — the exact words the recipient would see or hear. Do not write placeholders. If a tool exposes BOTH a content field AND a URL/webhook field, populate ONLY the content field. If an API tool returns an error, read the exact error message and retry with corrected parameters before telling the user it failed. If a tool returns 401, tell the user their API key is missing or expired and guide them to the Keys panel.${authInstruction}`

    let iterations = 0
    let totalTokens = 0
    let forceTextNext = false

    const rolling = createRollingHistory(history, 20_000)

    try {
        while (iterations < MAX_ITERATIONS && totalTokens < TOKEN_BUDGET) {
            const toolChoice = forceTextNext ? "none" : "auto"
            forceTextNext = false
            const { message, tokens } = await messageAI(req.anthropicKey!, systemContent, rolling.view, anthropicTools, toolChoice)
            totalTokens += tokens
            iterations++

            const toolUseBlocks = message.content.filter((b: any) => b.type === "tool_use") as any[]

            if (toolUseBlocks.length === 0) {
                rolling.push({ role: "assistant", content: message.content })
                break
            }

            rolling.push({ role: "assistant", content: message.content })

            const toolResults = await Promise.allSettled(
                toolUseBlocks.map(async (block: any) => {
                    const args = applyParamMap(block.input, paramMapByTool[block.name])
                    try {
                        const toolResponse = await callTool(sessionId, block.name, args)
                        const limited = Array.isArray(toolResponse) && toolResponse.length > 100
                            ? toolResponse.slice(0, 100)
                            : toolResponse
                        let content = JSON.stringify(limited)
                        if (content.length > MAX_RESPONSE_CHARS) {
                            content = content.slice(0, MAX_RESPONSE_CHARS) + `... [truncated — ${content.length - MAX_RESPONSE_CHARS} characters omitted]`
                        }
                        return content
                    } catch (toolErr: any) {
                        const errMsg = String(toolErr?.message ?? toolErr ?? "unknown error")
                        const toolDef = (req.body.tools ?? []).find((t: any) => t.function?.name === block.name)
                        if (toolDef?.handler?.method && toolDef.handler.method.toUpperCase() !== "GET") {
                            const fallback = {
                                sandbox_simulation: true,
                                info: "Simulation (schema validation fallback)",
                                simulated_request: {
                                    method: toolDef.handler.method.toUpperCase(),
                                    url: toolDef.handler.path,
                                    headers: {},
                                    body: Object.keys(args).length > 0 ? args : null
                                }
                            }
                            return JSON.stringify([{ type: "text", text: JSON.stringify(fallback) }])
                        }
                        if (errMsg.includes("-32000") || errMsg.includes("Invalid request") || errMsg.includes("unexpected response")) {
                            return "SESSION_EXPIRED"
                        }
                        return `Tool execution error: ${errMsg}`
                    }
                })
            )

            const toolResultBlocks = toolUseBlocks.map((block: any, i: number) => {
                const result = toolResults[i]
                return {
                    type: "tool_result" as const,
                    tool_use_id: block.id,
                    content: result.status === "fulfilled" ? result.value : `Unexpected error for tool "${block.name}".`
                }
            })
            rolling.push({ role: "user", content: toolResultBlocks })

            const sessionExpired = toolResultBlocks.some((b: any) => b.content === "SESSION_EXPIRED")
            if (sessionExpired) {
                rolling.push({ role: "assistant", content: "Your sandbox session has expired. Please refresh the page to start a new one." })
                break
            }

            const simBlocks = toolResultBlocks.filter((b: any) => typeof b.content === "string" && b.content.includes("sandbox_simulation"))
            if (simBlocks.length > 0) {
                const simTexts = simBlocks.map((b: any) => {
                    try {
                        const parsed = JSON.parse(b.content)
                        const entry = Array.isArray(parsed) ? parsed.find((e: any) => e.type === "text") : null
                        const sim = entry ? JSON.parse(entry.text) : null
                        if (sim?.simulated_request) {
                            const r = sim.simulated_request
                            return `**Sandbox simulation** — ${r.method} ${r.url}\n\`\`\`json\n${JSON.stringify(r.body ?? {}, null, 2)}\n\`\`\``
                        }
                    } catch {}
                    return "Sandbox simulation complete."
                })
                rolling.push({ role: "assistant", content: simTexts.join("\n\n") })
                break
            }

            forceTextNext = true
        }

        if (iterations >= MAX_ITERATIONS) {
            rolling.push({ role: "assistant", content: `I reached my step limit (${MAX_ITERATIONS} attempts) without completing the task.` })
        } else if (totalTokens >= TOKEN_BUDGET) {
            rolling.push({ role: "assistant", content: `I used too many tokens (${totalTokens}) and had to stop.` })
        }
    } catch (err: any) {
        history.splice(historyBaseLen)
        // Log so Render's runtime logs show what actually broke. err.status comes
        // from the Anthropic SDK; err.message is the most useful field on any
        // node Error. Stack last so it's easy to grep around.
        console.error(`[sandbox/chat] failed (status=${err?.status ?? "n/a"}): ${err?.message ?? err}`)
        if (err?.stack) console.error(err.stack)

        const is429 = err?.status === 429 || String(err?.message ?? "").includes("rate_limit")
        if (is429) {
            return res.status(429).json({
                error: "Rate limit reached on the Anthropic API. Wait a few seconds and try again.",
                retryAfterMs: 30_000
            })
        }
        const status = err?.status
        if (status === 401 || status === 403) {
            return res.status(401).json({ error: "Your Anthropic API key was rejected. Update it in the Keys panel." })
        }
        return res.status(500).json({ error: "Internal server error" })
    }

    const lastEntry = history[history.length - 1]
    const lastContent = lastEntry?.content
    const reply = typeof lastContent === "string"
        ? lastContent
        : Array.isArray(lastContent)
            ? lastContent.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
            : ""
    res.json({ reply, history })
})

// Try chat — production-mode session (no simulation, every method executes live).
app.post("/api/try/chat", aiLimiter, requireAnthropicKey, async (req: ByokRequest, res) => {
    const MAX_ITERATIONS = 10
    const TOKEN_BUDGET = 60000
    const MAX_RESPONSE_CHARS = 8000

    const sessionId = req.body.sessionId
    if (!sessionId || typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/.test(sessionId)) {
        return res.status(400).json({ error: "Invalid or missing sessionId" })
    }
    if (!req.body.message || typeof req.body.message !== "string") {
        return res.status(400).json({ error: "message must be a non-empty string" })
    }
    if (!Array.isArray(req.body.history)) {
        return res.status(400).json({ error: "history must be an array" })
    }
    if (!Array.isArray(req.body.tools)) {
        return res.status(400).json({ error: "tools must be an array" })
    }
    if (req.body.history.length > 200) {
        return res.status(400).json({ error: "Conversation history is too long. Please start a new session." })
    }
    if (String(req.body.message).length > 10_000) {
        return res.status(400).json({ error: "Message is too long (max 10000 characters)." })
    }

    const history: any[] = req.body.history
    const historyBaseLen = history.length
    history.push({ role: "user", content: req.body.message })

    const rawTools = (req.body.tools ?? [])
        .filter((t: any) => t.function?.name)
        .map(toAnthropicTool)
    const sanitized = rawTools.map(sanitizeAnthropicTool)
    const anthropicTools = sanitized.map((s: SanitizedTool) => s.tool)
    const paramMapByTool: Record<string, Record<string, string> | undefined> = {}
    sanitized.forEach((s: SanitizedTool) => { paramMapByTool[s.tool.name] = s.paramMap })

    const sanitizePromptField = (s: string) => s.replace(/[\n\r`]/g, " ").slice(0, 300)

    const authHints: string[] = []
    const authContext = req.body.authContext as { oauth2Url?: string; tokenUrl?: string; basicAuthNote?: string } | undefined
    if (authContext?.oauth2Url) {
        authHints.push(`This API uses OAuth 2.0. If a tool returns 401, the access token is missing or expired — direct the user to ${sanitizePromptField(authContext.oauth2Url)} to get a fresh one.`)
    }
    if (authContext?.tokenUrl && !authContext?.oauth2Url) {
        authHints.push(`This API uses OAuth 2.0 Client Credentials. If a tool returns 401, the user must exchange client_id+client_secret at ${sanitizePromptField(authContext.tokenUrl)} for a new access_token.`)
    }
    if (authContext?.basicAuthNote) {
        authHints.push(`This API uses Basic Auth. ${sanitizePromptField(authContext.basicAuthNote)}`)
    }
    const credentialPolicy = ` CREDENTIAL POLICY: All API credentials are auto-injected from the user's session. You NEVER ask for or echo credentials. If a tool returns 401/403 tell the user their credential is missing or invalid and point them to the Keys panel.`
    const authInstruction = credentialPolicy + (authHints.length > 0 ? ` AUTH CONTEXT: ${authHints.join(" ")}` : "")

    const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

    const systemContent = `Today's date is ${todayStr}. You are a live assistant connected to the user's real APIs through their generated MCP server. Every tool call executes against the production API — GET, POST, PUT, PATCH, DELETE all hit the real service and cause real side effects. Before any destructive write (delete, bulk update, send), briefly confirm the intent with the user. CONTENT FIELDS ARE THE DELIVERABLE: when a tool parameter accepts user-facing content, put the COMPLETE substantive content in that parameter — the exact words the recipient will see or hear. If a tool exposes BOTH a content field AND a URL/webhook field, populate ONLY the content field. When listing or searching, pass explicit filters the API supports. If a tool response ends with "[truncated — N characters omitted]", narrow the query and retry. If a tool returns 401, tell the user their credentials are missing or expired and point them to the Keys panel.${authInstruction}`

    let iterations = 0
    let totalTokens = 0

    const rolling = createRollingHistory(history, 20_000)

    try {
        while (iterations < MAX_ITERATIONS && totalTokens < TOKEN_BUDGET) {
            const { message, tokens } = await messageAI(req.anthropicKey!, systemContent, rolling.view, anthropicTools, "auto")
            totalTokens += tokens
            iterations++

            const toolUseBlocks = message.content.filter((b: any) => b.type === "tool_use") as any[]

            if (toolUseBlocks.length === 0) {
                rolling.push({ role: "assistant", content: message.content })
                break
            }

            rolling.push({ role: "assistant", content: message.content })

            const toolResults = await Promise.allSettled(
                toolUseBlocks.map(async (block: any) => {
                    try {
                        const toolResponse = await callTool(sessionId, block.name, applyParamMap(block.input, paramMapByTool[block.name]))
                        const limited = Array.isArray(toolResponse) && toolResponse.length > 100
                            ? toolResponse.slice(0, 100)
                            : toolResponse
                        let content = JSON.stringify(limited)
                        if (content.length > MAX_RESPONSE_CHARS) {
                            content = content.slice(0, MAX_RESPONSE_CHARS) + `... [truncated — ${content.length - MAX_RESPONSE_CHARS} characters omitted]`
                        }
                        return content
                    } catch (toolErr: any) {
                        const errMsg = String(toolErr?.message ?? toolErr ?? "unknown error")
                        if (errMsg.includes("-32000") || errMsg.includes("Invalid request") || errMsg.includes("unexpected response")) {
                            return "SESSION_EXPIRED"
                        }
                        return `Tool execution error: ${errMsg}`
                    }
                })
            )

            const toolResultBlocks = toolUseBlocks.map((block: any, i: number) => {
                const result = toolResults[i]
                return {
                    type: "tool_result" as const,
                    tool_use_id: block.id,
                    content: result.status === "fulfilled" ? result.value : `Unexpected error for tool "${block.name}".`
                }
            })
            rolling.push({ role: "user", content: toolResultBlocks })

            const sessionExpired = toolResultBlocks.some((b: any) => b.content === "SESSION_EXPIRED")
            if (sessionExpired) {
                history.splice(historyBaseLen)
                return res.status(410).json({ sessionExpired: true, error: "Session expired — a fresh one will be started automatically." })
            }
        }

        if (iterations >= MAX_ITERATIONS) {
            rolling.push({ role: "assistant", content: `I reached my step limit (${MAX_ITERATIONS} attempts) without completing the task.` })
        } else if (totalTokens >= TOKEN_BUDGET) {
            rolling.push({ role: "assistant", content: `I used too many tokens (${totalTokens}) and had to stop.` })
        }
    } catch (err: any) {
        history.splice(historyBaseLen)
        console.error(`[try/chat] failed (status=${err?.status ?? "n/a"}): ${err?.message ?? err}`)
        if (err?.stack) console.error(err.stack)

        const is429 = err?.status === 429 || String(err?.message ?? "").includes("rate_limit")
        if (is429) {
            return res.status(429).json({
                error: "Rate limit reached on the Anthropic API. Wait a few seconds and try again.",
                retryAfterMs: 30_000
            })
        }
        const status = err?.status
        if (status === 401 || status === 403) {
            return res.status(401).json({ error: "Your Anthropic API key was rejected. Update it in the Keys panel." })
        }
        return res.status(500).json({ error: "Internal server error" })
    }

    const lastEntry = history[history.length - 1]
    const lastContent = lastEntry?.content
    const reply = typeof lastContent === "string"
        ? lastContent
        : Array.isArray(lastContent)
            ? lastContent.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
            : ""
    res.json({ reply, history })
})

// Stateless download — frontend POSTs the registry, backend returns the zip.
app.post("/api/server/download", downloadLimiter, async (req, res) => {
    try {
        const { name, registry } = req.body
        if (!name || typeof name !== "string" || !/^[a-zA-Z0-9_\-]{1,64}$/.test(name)) {
            return res.status(400).json({ error: "name must be 1–64 chars (letters, numbers, hyphens, underscores)" })
        }
        if (!registry || typeof registry !== "object" || !Array.isArray(registry.tools) || registry.tools.length === 0) {
            return res.status(400).json({ error: "registry must include a non-empty tools array" })
        }
        const safeRegistry = {
            schema_version: 2,
            baseUrl: registry.baseUrl || "",
            tools: registry.tools.filter((t: any) => t.enabled !== false),
            auth: registry.auth || []
        }
        if (safeRegistry.tools.length === 0) {
            return res.status(400).json({ error: "No enabled tools in registry" })
        }

        const zipBuffer = await generateServerZip(name, safeRegistry)
        res.setHeader("Content-Type", "application/zip")
        res.setHeader("Content-Disposition", `attachment; filename="${name}-mcp-server.zip"`)
        res.send(zipBuffer)
    } catch (err: any) {
        res.status(500).json({ error: "Failed to generate server zip: " + err.message })
    }
})

// Generic 404 + error handler — never leak stack traces or internals.
app.use((_req, res) => {
    res.status(404).json({ error: "Not found" })
})

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    // Generic message — full details are logged server-side only.
    console.error("[unhandled]", err?.message ?? err)
    res.status(500).json({ error: "Internal server error" })
})

const PORT = Number(process.env.PORT) || 8000
app.listen(PORT, () => {
    console.log(`api server running on port ${PORT}`)
})
