import Anthropic from "@anthropic-ai/sdk";
import type { ToolsFile } from "./generate_tool_registry.ts";

const systemPrompt: Anthropic.Messages.TextBlockParam = {
  type: "text",
  text: `You are an API tool selector for an MCP server generator.
Your job is to look at a user's stated intent and a list of API tools, then return ONLY the tool names that are necessary to fulfill that intent.

Rules:
- Be minimal and precise — only include tools the user will realistically need
- If intent is vague, prefer including slightly more tools rather than fewer
- Consider the HTTP method and path as additional context
- Respond with a raw JSON array of tool name strings ONLY
- No explanation, no markdown fences, no extra text — just the array

Example response: ["get_pets", "create_pet", "delete_pet_by_id"]`,
  cache_control: { type: "ephemeral" },
}

export async function filterToolsByIntent(
  apiKey: string,
  registry: ToolsFile,
  userIntent: string
): Promise<ToolsFile> {
  if (!apiKey) throw new Error("Anthropic API key is required")
  if (!registry?.tools || registry.tools.length === 0) return registry

  const client = new Anthropic({ apiKey })

  const safeIntent = userIntent.replace(/`/g, "'").trim().slice(0, 500)

  const toolSummaries = registry.tools.map((t) => ({
    name: t.name,
    description: t.description || "No description provided",
    method: t.handler.method,
    path: t.handler.path,
  }))

  const userMessage = `User intent: "${safeIntent}"

Available tools:
${JSON.stringify(toolSummaries, null, 2)}

Return the JSON array of tool names needed to fulfill this intent.`

  let response: Anthropic.Messages.Message
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [systemPrompt],
      messages: [{ role: "user", content: userMessage }],
    }, { timeout: 20_000 })
  } catch {
    return registry
  }

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.Messages.TextBlock).text)
    .join("")
    .trim()

  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()

  let selectedNames: string[]
  try {
    selectedNames = JSON.parse(cleaned)
    if (!Array.isArray(selectedNames)) throw new Error("response is not an array")
  } catch {
    return registry
  }

  const validNames = new Set(registry.tools.map((t) => t.name))
  const selectedSet = new Set(selectedNames.filter((n) => validNames.has(n)))
  const filteredTools = registry.tools.filter((t) => selectedSet.has(t.name))

  if (filteredTools.length === 0) return registry

  return { ...registry, tools: filteredTools }
}
