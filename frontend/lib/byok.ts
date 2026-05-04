// BYOK (bring-your-own-key) state for the public demo.
//
// Anthropic key + provider credentials live ONLY in sessionStorage — they vanish
// when the tab closes. Backend never sees them except as headers / request bodies
// on the specific request that needs them; nothing is persisted server-side.

const ANTHROPIC_KEY = "helios_anthropic_key"
const PROVIDER_KEYS_KEY = "helios_provider_creds"

function safeWindow(): boolean {
  return typeof window !== "undefined"
}

export function getAnthropicKey(): string | null {
  if (!safeWindow()) return null
  return sessionStorage.getItem(ANTHROPIC_KEY)
}

export function setAnthropicKey(key: string): void {
  if (!safeWindow()) return
  sessionStorage.setItem(ANTHROPIC_KEY, key.trim())
}

export function clearAnthropicKey(): void {
  if (!safeWindow()) return
  sessionStorage.removeItem(ANTHROPIC_KEY)
}

export function hasAnthropicKey(): boolean {
  return !!getAnthropicKey()
}

/**
 * Quick shape check — Anthropic keys start with sk-ant-. Doesn't guarantee
 * the key is valid (only the API can confirm), but rejects obvious junk.
 */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-/.test(key.trim())
}

/**
 * Returns the headers needed for any AI-bound backend request.
 * Throws if no key is configured — callers should check hasAnthropicKey first
 * or catch and redirect to the BYOK setup page.
 */
export function getAiHeaders(): Record<string, string> {
  const key = getAnthropicKey()
  if (!key) throw new Error("No Anthropic API key configured. Visit the home page to set one.")
  return { "x-anthropic-key": key }
}

// ─── Per-integration provider credentials (per-session) ────────────────────────
// Map shape: { [integrationId]: "credential string" }. Credential format depends
// on the integration: Bearer tokens, "username:password" for basic auth, etc.

export type ProviderCredentials = Record<string, string>

export function getProviderCredentials(): ProviderCredentials {
  if (!safeWindow()) return {}
  const raw = sessionStorage.getItem(PROVIDER_KEYS_KEY)
  if (!raw) return {}
  try { return JSON.parse(raw) as ProviderCredentials } catch { return {} }
}

export function setProviderCredential(integrationId: string, value: string): void {
  if (!safeWindow()) return
  const all = getProviderCredentials()
  all[integrationId] = value
  sessionStorage.setItem(PROVIDER_KEYS_KEY, JSON.stringify(all))
}

export function deleteProviderCredential(integrationId: string): void {
  if (!safeWindow()) return
  const all = getProviderCredentials()
  delete all[integrationId]
  sessionStorage.setItem(PROVIDER_KEYS_KEY, JSON.stringify(all))
}

export function clearAllProviderCredentials(): void {
  if (!safeWindow()) return
  sessionStorage.removeItem(PROVIDER_KEYS_KEY)
}
