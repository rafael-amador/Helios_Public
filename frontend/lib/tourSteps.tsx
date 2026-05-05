// Tour content for each page. One export per tour.
// Edit copy here — TourOverlay just renders what these say.

import type { TourStep } from "./tour"

// Reusable demo star — matches the constellation stars on the dashboard so
// users see exactly what their built servers will look like.
function DemoStar() {
  return (
    <div className="flex flex-col items-center gap-3 py-3">
      <div className="relative h-12 w-12 flex items-center justify-center">
        <div
          className="absolute rounded-full animate-pulse"
          style={{
            width: 36,
            height: 36,
            background: "radial-gradient(circle, rgba(255,220,140,0.95) 0%, rgba(255,180,80,0.55) 40%, rgba(255,140,40,0) 75%)",
            filter: "blur(0.4px)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 10,
            height: 10,
            background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,220,140,0.8) 60%, rgba(255,180,80,0) 100%)",
          }}
        />
      </div>
      <span className="font-[family-name:--font-cormorant] italic text-[12px] text-white/55 text-center">
        each server you build becomes a star
      </span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Dashboard / home page
// ──────────────────────────────────────────────────────────────────────────────

export const DASHBOARD_TOUR: TourStep[] = [
  {
    centered: true,
    title: "Welcome to Helios",
    body: "A quick tour — about 30 seconds. You can press → to advance, ← to go back, or Esc to skip out.",
  },
  {
    target: '[data-tour-id="dashboard-build"]',
    placement: "bottom",
    title: "Build Your Server",
    body: "Pick an API, generate an MCP server tailored to it, then test it live. The whole flow takes under a minute.",
  },
  {
    target: '[data-tour-id="dashboard-key"]',
    placement: "bottom",
    title: "Your Anthropic Key",
    body: "Helios is bring-your-own-key — your Anthropic key powers the AI calls and never leaves your browser session. Click here to set it or replace it later.",
  },
  {
    target: '[data-tour-id="dashboard-info"]',
    placement: "bottom",
    title: "Info Page",
    body: "Docs on what an MCP server is, why we use one, and where to grab the API keys for popular providers.",
  },
  {
    target: '[data-tour-id="dashboard-servers"]',
    placement: "top",
    title: "Your Servers",
    body: "Servers you build appear here as cards. Click any card to reopen its sandbox.",
    extra: <DemoStar />,
  },
  {
    centered: true,
    title: "You're set",
    body: "Hit Build Your Server when you're ready. Your work persists in this tab — closing it wipes everything (no accounts, no database).",
  },
]

// ──────────────────────────────────────────────────────────────────────────────
// Create page
// ──────────────────────────────────────────────────────────────────────────────

export const CREATE_TOUR: TourStep[] = [
  {
    centered: true,
    title: "Build a Tool Catalog",
    body: "This page is where you tell Helios what API you want to wrap. Two ways to do it on this screen — then a final step appears once you've added your tools.",
  },
  {
    target: '[data-tour-id="create-premade"]',
    placement: "top",
    title: "Premade APIs",
    body: "The fastest path. Pick a popular API like GitHub, Spotify, or Twilio — Helios already knows its endpoints. Just click an icon, choose which tools to include, and it's added to your working set.",
  },
  {
    target: '[data-tour-id="create-custom"]',
    placement: "top",
    title: "Or Bring Your Own",
    body: "Type a name, paste an OpenAPI spec URL, or drop in a JSON/YAML file. Helios parses every endpoint and turns each one into a tool your AI can call.",
  },
  {
    centered: true,
    title: "After You've Added Tools",
    body: "Once tools are in your working set, a new screen appears with a free-text \"intent\" box (where you describe what you want to do — Helios uses Claude to filter the catalog down) and a Generate button that drops you straight into the sandbox to chat with your new server.",
  },
]

// ──────────────────────────────────────────────────────────────────────────────
// Sandbox page
// ──────────────────────────────────────────────────────────────────────────────

export const SANDBOX_TOUR: TourStep[] = [
  {
    centered: true,
    title: "Sandbox Mode",
    body: "Test your server safely. GET requests hit the real API; POST/PUT/DELETE are simulated — Helios shows you what would have been sent without actually doing it.",
  },
  {
    target: '[data-tour-id="sandbox-tools"]',
    placement: "top",
    title: "Tools & Keys",
    body: "Open this panel to see every tool the AI can call (toggle them on/off) and to paste credentials for APIs that need them — like a GitHub PAT or Twilio Auth Token. Credentials live only in this browser tab.",
  },
  {
    target: '[data-tour-id="sandbox-input"]',
    placement: "top",
    title: "Talk to It",
    body: "Type a request like \"list my last 5 issues\" or \"send a test SMS to +1...\". Claude picks the right tool and runs it.",
  },
  {
    target: '[data-tour-id="sandbox-download"]',
    placement: "bottom",
    title: "Happy with It?",
    body: "Click Download to grab a standalone MCP server zip. Plug it into Claude Desktop, Cursor, or any MCP client.",
  },
]

// ──────────────────────────────────────────────────────────────────────────────
// Try page (live mode)
// ──────────────────────────────────────────────────────────────────────────────

export const TRY_TOUR: TourStep[] = [
  {
    centered: true,
    title: "Live Mode — Real Calls",
    body: "Unlike the sandbox, every request here HITS THE REAL API. Use this for final verification, but be careful with destructive operations (delete, send, etc.). Helios asks Claude to confirm before any irreversible write.",
  },
  {
    target: '[data-tour-id="try-tools"]',
    placement: "top",
    title: "Tools & Credentials",
    body: "Same panel as the sandbox — toggle tools on/off and paste real credentials for the target API. In live mode, those credentials get used for real, so paste with care.",
  },
  {
    target: '[data-tour-id="try-input"]',
    placement: "top",
    title: "Talk to It",
    body: "Same chat interface as the sandbox, except every call lands in the real API. Try simple GETs first to confirm everything's wired up.",
  },
]

// ──────────────────────────────────────────────────────────────────────────────
// Download page
// ──────────────────────────────────────────────────────────────────────────────

export const DOWNLOAD_TOUR: TourStep[] = [
  {
    target: '[data-tour-id="download-zip"]',
    placement: "top",
    title: "Download the ZIP",
    body: "Self-contained Node.js MCP server. Includes everything — server.ts, tools.json, package.json, README, and a .env.example for your credentials.",
  },
  {
    target: '[data-tour-id="download-try"]',
    placement: "top",
    title: "Or Test It Live First",
    body: "Open the same server in Live mode without leaving the browser. Real API calls — useful for one last sanity check before you ship.",
  },
]
