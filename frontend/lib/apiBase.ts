// Single source of truth for the backend base URL.
// In dev: defaults to http://localhost:8000.
// In prod: set NEXT_PUBLIC_API_URL on Vercel to the Render service URL.
//
// NEXT_PUBLIC_* env vars are inlined at build time — change requires redeploy.

export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
  "http://localhost:8000"
