// MCP server — port 3000 (internal). Pure tool dispatch: no AI, no DB.
//
// Demo BYOK model: provider credentials (Twilio Account SID, GitHub PAT, etc.)
// arrive in the initialize request body and live ONLY in process memory keyed
// by sessionId. They are never persisted, never logged, and evicted when the
// session times out (30 min idle).
//
// Start: npx tsx server.ts
import dotenv from "dotenv"
dotenv.config()

import { randomUUID } from "node:crypto"
import express from "express"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { Request, Response } from "express"
import type { ToolsFile, EndpointDefinition, ToolEnrichment } from "./generate_tool_registry.ts"
import { assertSafeBaseUrl } from "./ssrfGuard.ts"

const VALID_AUTO_PATH_SOURCES = new Set(["auth_username"])

/**
 * Redacts secret-looking query string values from a URL before logging.
 * Hides anything after `?key=`, `?token=`, `?api_key=`, etc., regardless of name.
 * Logs are the most common credential leak channel — assume nothing, redact everything.
 */
function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    const safe = new URLSearchParams()
    for (const k of u.searchParams.keys()) safe.set(k, "<redacted>")
    u.search = safe.toString() ? "?" + safe.toString() : ""
    return u.toString()
  } catch {
    return url.replace(/\?.*$/, "?<redacted>")
  }
}

function registerDynamicTool(
  server: McpServer,
  endpoint: EndpointDefinition,
  baseUrl: string,
  getCredential: (integrationId: string) => string | undefined,
  unrestricted: boolean
) {
  const schema: Record<string, any> = {}
  const required = Array.isArray(endpoint.input_schema.required) ? endpoint.input_schema.required : []
  for (const paramName in endpoint.input_schema.properties) {
    const paramInfo = endpoint.input_schema.properties[paramName]
    const isRequired = required.includes(paramName)
    let field: any
    if (paramInfo.type === "number" || paramInfo.type === "integer") {
      field = z.number().describe(paramInfo.description || "")
    } else if (paramInfo.type === "boolean") {
      field = z.boolean().describe(paramInfo.description || "")
    } else if (paramInfo.type === "object") {
      field = z.record(z.string(), z.any()).describe(paramInfo.description || "")
    } else if (paramInfo.type === "array") {
      const items = (paramInfo as any).items
      if (items?.type === "object") {
        field = z.array(z.record(z.string(), z.any())).describe(paramInfo.description || "")
      } else if (items?.type === "number" || items?.type === "integer") {
        field = z.array(z.number()).describe(paramInfo.description || "")
      } else if (items?.type === "boolean") {
        field = z.array(z.boolean()).describe(paramInfo.description || "")
      } else {
        field = z.array(z.string()).describe(paramInfo.description || "")
      }
    } else if (Array.isArray(paramInfo.enum) && paramInfo.enum.length > 0) {
      const [first, ...rest] = paramInfo.enum as [string, ...string[]]
      field = z.enum([first, ...rest]).describe(paramInfo.description || "")
    } else {
      field = z.string().describe(paramInfo.description || "")
    }
    schema[paramName] = isRequired ? field : field.optional()
  }

  const enrichment: ToolEnrichment = (endpoint as any).enrichment ?? { auth: null }

  const hasInputParams = Object.keys(schema).length > 0
  server.registerTool(
    endpoint.name,
    {
      description: endpoint.description,
      inputSchema: hasInputParams ? schema : undefined
    },
    async (args) => {
      // Decode HTML entities in markup-format params (TwiML, XML, HTML)
      const props = endpoint.input_schema.properties
      for (const k in args) {
        const v = args[k]
        if (typeof v !== "string") continue
        const fmt = String(props[k]?.format || "").toLowerCase()
        if (fmt !== "twiml" && fmt !== "xml" && fmt !== "html") continue
        if (v.includes("&lt;") || v.includes("&gt;") || v.includes("&quot;") || v.includes("&#34;") || v.includes("&apos;") || v.includes("&#39;")) {
          args[k] = v
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#34;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#39;/g, "'")
        }
      }

      // Strip XML wrappers / tool-call leakage from markup values
      for (const k in args) {
        const v = args[k]
        if (typeof v !== "string") continue
        const fmt = String(props[k]?.format || "").toLowerCase()
        if (fmt !== "twiml" && fmt !== "xml" && fmt !== "html") continue
        let cleaned = v.trim()
        cleaned = cleaned.replace(/^\s*<\?xml[^?]*\?>\s*/i, "")
        const cdataMatch = cleaned.match(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/)
        if (cdataMatch) cleaned = cdataMatch[1].trim()
        cleaned = cleaned.replace(/^\s*<\?xml[^?]*\?>\s*/i, "")
        const rootMatch = cleaned.match(/^<\s*([a-zA-Z][\w-]*)/)
        if (rootMatch) {
          const closeRe = new RegExp(`</\\s*${rootMatch[1]}\\s*>`, "i")
          const closeMatch = cleaned.match(closeRe)
          if (closeMatch && closeMatch.index !== undefined) {
            cleaned = cleaned.slice(0, closeMatch.index + closeMatch[0].length)
          }
        }
        if (cleaned !== v) args[k] = cleaned
      }

      // Drop URL fields when sibling content field is populated
      const hasNonEmptyMarkup = Object.entries(args).some(([k, v]) => {
        if (typeof v !== "string" || v.trim() === "") return false
        const fmt = String(props[k]?.format || "").toLowerCase()
        return fmt === "twiml" || fmt === "xml" || fmt === "html"
      })
      if (hasNonEmptyMarkup) {
        for (const k of Object.keys(args)) {
          const v = args[k]
          if (typeof v !== "string" || v.trim() === "") continue
          const fmt = String(props[k]?.format || "").toLowerCase()
          if (fmt === "uri") delete args[k]
        }
      }

      // Restore original param names (Anthropic schema-key sanitization reversal)
      const paramNameMap = endpoint.handler.param_name_map
      if (paramNameMap) {
        const restored: Record<string, any> = {}
        for (const k in args) restored[paramNameMap[k] ?? k] = args[k]
        args = restored
      }

      // Look up credential from in-memory session map (BYOK, no DB)
      const auth = enrichment.auth
      const storedKey: string | undefined = auth && auth.integration_id
        ? getCredential(auth.integration_id)
        : undefined

      // Auto-fill path params from saved credential
      let url = baseUrl + endpoint.handler.path
      const autoPathParams = endpoint.handler.auto_path_params
      if (autoPathParams && Object.keys(autoPathParams).length > 0) {
        for (const [paramName, source] of Object.entries(autoPathParams)) {
          if (!VALID_AUTO_PATH_SOURCES.has(source)) {
            return { content: [{ type: "text", text: `Configuration error: unsupported auto_path_params source "${source}". Regenerate the tool catalog.` }] }
          }
        }
        if (!storedKey) {
          const groupId = auth?.integration_id || endpoint.name
          return { content: [{ type: "text", text: `Credential for "${groupId}" not configured — open the Keys panel and paste it.` }] }
        }
        const colonIdx = storedKey.indexOf(":")
        const authUser = colonIdx >= 0 ? storedKey.slice(0, colonIdx) : storedKey
        for (const [paramName, source] of Object.entries(autoPathParams)) {
          if (source === "auth_username" && authUser) {
            url = url.replace(`{${paramName}}`, encodeURIComponent(authUser))
          }
        }
      }

      // Substitute remaining path params from AI args
      for (const paramName in args) {
        if (url.includes(`{${paramName}}`) && args[paramName] !== undefined) {
          url = url.replace(`{${paramName}}`, encodeURIComponent(String(args[paramName])))
        }
      }

      const unresolved = url.match(/\{[^}]+\}/)
      if (unresolved) {
        return { content: [{ type: "text", text: `Missing required path parameter: ${unresolved[0]}. Provide the value and try again.` }] }
      }

      const params = new URLSearchParams()
      for (const paramName of (endpoint.handler.query_params || [])) {
        const val = args[paramName]
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          params.append(paramName, String(val))
        }
      }
      for (const [k, v] of Object.entries(endpoint.handler.fixed_query_params || {})) {
        params.set(k, v)
      }

      const headers: Record<string, string> = { ...(endpoint.handler.headers || {}) }

      if (auth && storedKey) {
        switch (auth.template) {
          case "bearer_token":
          case "oauth2_client_creds":
          case "oauth2_auth_code":
            headers["Authorization"] = `Bearer ${storedKey}`
            break
          case "api_key_header":
            headers[auth.header_name || "X-API-Key"] = storedKey
            break
          case "api_key_query":
            params.set(auth.param_name || "api_key", storedKey)
            break
          case "basic_auth":
            headers["Authorization"] = `Basic ${Buffer.from(storedKey).toString("base64")}`
            break
        }
      }

      if (params.toString()) {
        url += "?" + params.toString()
      }

      const method = endpoint.handler.method.toUpperCase()

      const qp = endpoint.handler.query_params || []
      const bodyParams: Record<string, any> = {}
      if (method !== "GET") {
        for (const key in args) {
          if (!endpoint.handler.path.includes(`{${key}}`) && !qp.includes(key) && args[key] !== undefined) {
            bodyParams[key] = args[key]
          }
        }
      }

      // Sandbox mode: simulate non-GET, never hit the real API
      if (!unrestricted && method !== "GET") {
        const simulation = {
          sandbox_simulation: true,
          info: "Sandbox simulation complete. This is the final result — the sandbox does not execute write operations. Do not retry.",
          simulated_request: {
            method,
            url,
            headers: { ...headers, "Content-Type": "application/json" },
            body: Object.keys(bodyParams).length > 0 ? bodyParams : null
          }
        }
        return { content: [{ type: "text", text: JSON.stringify(simulation, null, 2) }] }
      }

      // SSRF guard on the FINAL url (post path-param substitution)
      try {
        assertSafeBaseUrl(url)
      } catch (err: unknown) {
        return { content: [{ type: "text", text: `Refused to dispatch: ${(err as Error).message}` }] }
      }

      const fetchInit: RequestInit = { method, headers, redirect: "manual" }
      if (method !== "GET" && Object.keys(bodyParams).length > 0) {
        if (endpoint.handler.body_format === "form") {
          headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded"
          const formBody = new URLSearchParams()
          for (const [k, v] of Object.entries(bodyParams)) {
            if (v === undefined || v === null) continue
            formBody.append(k, typeof v === "object" ? JSON.stringify(v) : String(v))
          }
          fetchInit.body = formBody.toString()
        } else if (endpoint.handler.body_format === "multipart") {
          for (const k of Object.keys(headers)) {
            if (k.toLowerCase() === "content-type") delete headers[k]
          }
          const form = new FormData()
          for (const [k, v] of Object.entries(bodyParams)) {
            if (v === undefined || v === null) continue
            form.append(k, typeof v === "object" ? JSON.stringify(v) : String(v))
          }
          fetchInit.body = form
        } else {
          headers["Content-Type"] = headers["Content-Type"] || "application/json"
          fetchInit.body = JSON.stringify(bodyParams)
        }
      }

      let response: Awaited<ReturnType<typeof fetch>>
      try {
        console.log(`[tool:${endpoint.name}] ${method} ${redactUrl(url)}`)
        const controller = new AbortController()
        const fetchTimer = setTimeout(() => controller.abort(), 10_000)
        try {
          response = await fetch(url, { ...fetchInit, signal: controller.signal })
        } finally {
          clearTimeout(fetchTimer)
        }
      } catch (err: any) {
        const msg = err.name === "AbortError"
          ? `Request to ${redactUrl(url)} timed out after 10 seconds`
          : `Network error: ${err.message}`
        return { content: [{ type: "text", text: msg }] }
      }

      if (response.status >= 300 && response.status < 400) {
        return { content: [{ type: "text", text: `Request refused: API returned a redirect (HTTP ${response.status}) which is not followed for security reasons.` }] }
      }

      const textResponse = await response.text()

      if (!response.ok) {
        const reason =
          response.status === 429
            ? `Rate limit hit (429). Wait a moment and try again. Body: ${textResponse.slice(0, 200)}`
            : response.status === 401
            ? `Unauthorized (401) — the API key or Bearer token is missing or expired. Tell the user to re-enter their credential in the Keys panel.`
            : `API error ${response.status}: ${textResponse.slice(0, 500)}`
        return { content: [{ type: "text", text: reason }] }
      }

      let data
      try {
        data = textResponse ? JSON.parse(textResponse) : "Success (Empty Response)"
      } catch {
        data = textResponse
      }

      return {
        content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }]
      }
    }
  )
}

const app = express()
app.use(express.json({ limit: "10mb" }))

const transports          = new Map<string, StreamableHTTPServerTransport>()
const MCPserver           = new Map<string, McpServer>()
const sessionTimers       = new Map<string, ReturnType<typeof setTimeout>>()
// In-memory per-session credentials map: { sessionId → { integrationId → secret } }
// Never persisted, never logged. Evicted with the session.
const sessionCredentials  = new Map<string, Record<string, string>>()

const SESSION_TTL_MS = 30 * 60 * 1000

function evictSession(sessionId: string) {
  transports.delete(sessionId)
  MCPserver.delete(sessionId)
  sessionCredentials.delete(sessionId)
  const t = sessionTimers.get(sessionId)
  if (t) { clearTimeout(t); sessionTimers.delete(sessionId) }
}

function refreshSessionTimer(sessionId: string) {
  const existing = sessionTimers.get(sessionId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => evictSession(sessionId), SESSION_TTL_MS)
  sessionTimers.set(sessionId, timer)
}

async function postHandler(req: Request, res: Response) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined

  if (sessionId && transports.has(sessionId)) {
    refreshSessionTimer(sessionId)
    const transport = transports.get(sessionId)!
    await transport.handleRequest(req, res, req.body)
    return
  }

  if (!sessionId && isInitializeRequest(req.body)) {
    const params = req.body.params as any
    const toolsData = params?.toolsRegistry as ToolsFile
    const credentials = (params?.credentials as Record<string, string>) || {}
    const unrestricted = params?.unrestricted === true

    if (!toolsData || !Array.isArray(toolsData.tools)) {
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32602, message: "toolsRegistry missing or invalid in initialize params" }, id: null })
      return
    }

    try {
      assertSafeBaseUrl(toolsData.baseUrl)
    } catch (err: any) {
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32602, message: `Unsafe baseUrl: ${err.message}` }, id: null })
      return
    }

    const server = new McpServer({ name: "mcpServer", version: "1.0.0" })
    let assignedSessionId: string | null = null

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        assignedSessionId = id
        transports.set(id, transport)
        MCPserver.set(id, server)
        sessionCredentials.set(id, credentials)
        refreshSessionTimer(id)
      }
    })

    transport.onclose = () => {
      if (transport.sessionId) evictSession(transport.sessionId)
    }

    // Closure: tools resolve credentials by reading the session map at call time
    const getCredential = (integrationId: string): string | undefined => {
      if (!assignedSessionId) return undefined
      const map = sessionCredentials.get(assignedSessionId)
      return map?.[integrationId]
    }

    for (const tool of toolsData.tools) {
      registerDynamicTool(server, tool, toolsData.baseUrl, getCredential, unrestricted)
    }

    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
    return
  }

  res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Invalid request" }, id: null })
}

async function getHandler(req: Request, res: Response) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send("Invalid or missing session ID")
    return
  }
  await transports.get(sessionId)!.handleRequest(req, res)
}

async function deleteHandler(req: Request, res: Response) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send("Invalid or missing session ID")
    return
  }
  await transports.get(sessionId)!.handleRequest(req, res)
}

app.post("/mcp", postHandler)
app.get("/mcp", getHandler)
app.delete("/mcp", deleteHandler)

app.listen(3000, () => console.log("MCP server running on port 3000 (internal)"))
