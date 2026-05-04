// MCP client — called by api.ts to communicate with server.ts (port 3000).
// Handles session initialization, tool listing, tool execution, and Claude AI calls.
//
// BYOK model: every Anthropic call takes an explicit apiKey. No module-scope
// client, no env fallback — if the caller doesn't provide a key the demo refuses.
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto"
import type { ToolsFile } from "./generate_tool_registry.ts"

const MCP_URL = "http://localhost:3000/mcp"

async function mcpFetch(options: {
    sessionId?: string
    body: object
    timeoutMs?: number
}): Promise<Response> {
    const { sessionId, body, timeoutMs = 15_000 } = options
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        if (sessionId) headers["mcp-session-id"] = sessionId
        return await fetch(MCP_URL, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        })
    } catch (err: any) {
        if (err.name === "AbortError") throw new Error(`MCP request timed out after ${timeoutMs}ms`)
        throw err
    } finally {
        clearTimeout(timer)
    }
}

function parseSseData(text: string, httpStatus: number): any {
    const dataLine = text.split("\n").find(line => line.startsWith("data: "))
    if (!dataLine) {
        throw new Error(`MCP server returned unexpected response (HTTP ${httpStatus}): ${text.slice(0, 300)}`)
    }
    const parsed = JSON.parse(dataLine.slice(6))
    if (parsed.error) {
        throw new Error(`MCP error ${parsed.error.code}: ${parsed.error.message}`)
    }
    return parsed
}

export async function initializeAgent(
    registry: ToolsFile,
    credentials: Record<string, string>,
    unrestricted: boolean = false
): Promise<string> {
    const response = await mcpFetch({
        timeoutMs: 10_000,
        body: {
            jsonrpc: "2.0",
            id: randomUUID(),
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: unrestricted ? "helios-try" : "helios-sandbox", version: "1.0.0" },
                toolsRegistry: registry,
                credentials,        // per-session in-memory credential map (BYOK)
                unrestricted
            }
        }
    })

    const sessionId = response.headers.get("mcp-session-id")
    await response.text()
    if (!sessionId) throw new Error("No session ID returned from MCP server")
    return sessionId
}

export async function getTools(sessionId: string): Promise<any[]> {
    const response = await mcpFetch({
        sessionId,
        timeoutMs: 10_000,
        body: { jsonrpc: "2.0", id: randomUUID(), method: "tools/list", params: {} }
    })
    const text = await response.text()
    const data = parseSseData(text, response.status)
    if (!data.result?.tools) throw new Error("tools/list returned no tools")
    return data.result.tools
}

export async function callTool(sessionId: string, toolName: string, args: Record<string, any>): Promise<any[]> {
    const response = await mcpFetch({
        sessionId,
        timeoutMs: 15_000,
        body: {
            jsonrpc: "2.0",
            id: randomUUID(),
            method: "tools/call",
            params: { name: toolName, arguments: args }
        }
    })
    const text = await response.text()
    const data = parseSseData(text, response.status)
    if (!data.result?.content) throw new Error(`tools/call returned no content for "${toolName}"`)
    return data.result.content
}

export function compressToolsForClaude(tools: Anthropic.Messages.Tool[]): Anthropic.Messages.Tool[] {
    return tools.map(tool => ({
        name: tool.name,
        description: tool.description ? tool.description.slice(0, 140) : undefined,
        input_schema: compressSchema(tool.input_schema as any) as Anthropic.Messages.Tool["input_schema"]
    }))
}

function compressSchema(schema: any): any {
    if (!schema || typeof schema !== "object") return schema
    const out: any = { type: schema.type }
    if (schema.required?.length) out.required = schema.required
    if (schema.properties) {
        out.properties = {}
        for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
            const compressed: any = { type: prop?.type ?? "string" }
            if (prop?.enum?.length) compressed.enum = prop.enum
            if (prop?.items?.type) compressed.items = { type: prop.items.type }
            if (prop?.description) compressed.description = String(prop.description).slice(0, 200)
            if (prop?.format) compressed.format = prop.format
            out.properties[key] = compressed
        }
    }
    return out
}

/**
 * Calls Claude using the supplied per-request API key (BYOK).
 * Constructs a fresh client each call — the SDK is cheap to instantiate and this
 * keeps users' keys fully isolated. Retries once on 429.
 */
export async function messageAI(
    apiKey: string,
    system: string,
    messages: Anthropic.Messages.MessageParam[],
    tools: Anthropic.Messages.Tool[],
    toolChoice?: "none" | "auto"
): Promise<{ message: Anthropic.Messages.Message, tokens: number }> {
    if (!apiKey) throw new Error("Anthropic API key is required")
    const client = new Anthropic({ apiKey })

    const compressed = compressToolsForClaude(tools)
    const toolParams = toolChoice === "none" || compressed.length === 0
        ? {}
        : { tools: compressed, tool_choice: { type: "auto" as const } }

    const RETRY_DELAYS_MS = [12_000, 25_000]
    let lastErr: any

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        if (attempt > 0) {
            await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
        }
        try {
            const response = await client.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 4096,
                ...(system ? { system } : {}),
                messages,
                ...toolParams
            }, { timeout: 90_000 })

            return {
                message: response,
                tokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)
            }
        } catch (err: any) {
            lastErr = err
            const is429 = err?.status === 429 || String(err?.message ?? "").includes("rate_limit")
            if (!is429 || attempt >= RETRY_DELAYS_MS.length) throw err
        }
    }
    throw lastErr
}
