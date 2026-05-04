// Shared SSRF guard. Imported by both:
//   - api.ts  → validates user-supplied spec URLs before SwaggerParser fetch
//   - server.ts → validates baseUrl at MCP session init AND on each outbound URL
//
// Always blocks: loopback, link-local (incl. AWS IMDS 169.254.169.254), IPv6
// link-local + ULA, IPv4-mapped IPv6, decimal/hex IP encodings.
// Production-only blocks: RFC1918 private ranges (10.x, 172.16-31.x, 192.168.x).
//
// NOTE on residual risk: this validates the TOP-LEVEL URL only. A spec that
// passes the check can still contain `$ref` pointers that SwaggerParser will
// dereference recursively, and APIs the guard allows can still 30x to internal
// addresses. Callers that follow redirects MUST set `redirect: "manual"` and
// re-validate; callers that dereference $refs are out of scope of this guard.

export function assertSafeUrl(url: string): void {
  if (!url) return // composite registries use "" — nothing to validate
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`URL "${url}" is not a valid URL`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`URL must use http or https (got "${parsed.protocol}")`)
  }

  const host = parsed.hostname.toLowerCase()

  // Always block: loopback and link-local (includes AWS IMDS 169.254.169.254)
  if (host === "localhost") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("URL must not target localhost in production")
    }
    return
  }
  if (host === "::1" || host === "[::1]" || host === "0.0.0.0") {
    throw new Error(`URL must not target loopback address "${host}"`)
  }

  // IPv6 link-local (fe80::/10)
  if (/^fe[89ab]/i.test(host.replace(/^\[|\]$/g, ""))) {
    throw new Error(`URL must not target IPv6 link-local address "${host}"`)
  }

  // IPv6 unique local (fc00::/7)
  if (/^f[cd]/i.test(host.replace(/^\[|\]$/g, ""))) {
    throw new Error(`URL must not target IPv6 unique-local address "${host}"`)
  }

  // IPv4-mapped IPv6 (::ffff:x.x.x.x) — recurse on the embedded IPv4
  const strippedHost = host.replace(/^\[|\]$/g, "")
  const ipv4mapped = strippedHost.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i)
  if (ipv4mapped) {
    try {
      assertSafeUrl(`${parsed.protocol}//` + ipv4mapped[1])
    } catch (err: unknown) {
      throw new Error(`URL contains a blocked IPv4-mapped IPv6 address: ${(err as Error).message}`)
    }
    return
  }

  // Decimal and hex numeric IP encodings (e.g. http://2130706433/ → 127.0.0.1)
  const bareHost = host.replace(/^\[|\]$/g, "")
  if (/^\d+$/.test(bareHost) || /^0x[0-9a-f]+$/i.test(bareHost)) {
    throw new Error(`URL uses a numeric/hex IP encoding "${bareHost}" — use a standard dotted-quad IP or hostname instead`)
  }

  // IPv4 dotted-quad checks
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [, a, b] = ipv4.map(Number)
    if (a === 127) throw new Error("URL must not target loopback (127.x.x.x)")
    if (a === 169 && b === 254) throw new Error("URL must not target link-local address (169.254.x.x)")

    if (process.env.NODE_ENV === "production") {
      if (a === 10) throw new Error("URL must not target private network (10.x.x.x) in production")
      if (a === 172 && b >= 16 && b <= 31) throw new Error("URL must not target private network (172.16-31.x.x) in production")
      if (a === 192 && b === 168) throw new Error("URL must not target private network (192.168.x.x) in production")
    }
  }
}

// Backwards-compat alias — server.ts originally called this `assertSafeBaseUrl`.
export const assertSafeBaseUrl = assertSafeUrl
