import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── Role descriptions ─────────────────────────────────────────────
const ROLE_DESC: Record<string, string> = {
  SA: "Super Admin — full system access, system settings, user management",
  AD: "Admin — user management, all analytics, no system config",
  DE: "Data Entrant — create/confirm transactions, edit dividends, edit company data",
  VR: "Verifier — verify/reject transactions, view analytics",
  RO: "Read Only — view-only access to all data",
};

// ── Auto model selection ──────────────────────────────────────────
function pickModel(message: string): string {
  const isSwahili = /\b(nina|nataka|vipi|nini|wapi|nisaidie|habari|shukran|tafadhali|kwa|nikusaidie|saidia|naomba|nimefanya|sijui|eleza|naweza|jinsi|gani|kodi|hisa|soko|bei|faida|hasara|mgao)\b/i.test(message);
  const isComplex = message.length > 120 || /\b(explain|compare|difference|why|how does.*work|calculate|eleza|tofauti|linganisha|fafanua|what happens if|step.?by.?step)\b/i.test(message);
  return (isSwahili || isComplex) ? "gemini-2.5-flash" : "gemini-2.5-flash-lite";
}

// ── System prompt ─────────────────────────────────────────────────
function buildSystemPrompt(ctx: { userName?: string; role?: string; currentPage?: string; cdsNumber?: string }): string {
  const roleDesc = ROLE_DESC[ctx.role || ""] || "Unknown role";
  return `<identity>
You are the Investors Portal Assistant — an AI helper built into the InvestorsPortal web application for the Dar es Salaam Stock Exchange (DSE).

Your purpose:
- Help users navigate the app (which page, which button, which workflow)
- Explain DSE investing concepts (fees, taxation, settlement, FIFO)
- Answer questions about their role and what they can/cannot do
- Guide through transaction entry, dividend recording, report generation

Rules:
- NEVER give financial advice — no buy/sell recommendations, no price predictions
- Only provide educational guidance and factual information
- If user writes in Swahili, respond in Swahili
- Keep answers concise — use bullet points for step-by-step procedures
- Reference specific pages, buttons, and menu items the user should click
- When unsure, say "I'm not sure about that — please check with your administrator"
- Use TZS for currency references
- Format numbers with commas (e.g., 1,500,000)
</identity>

<user_context>
Name: ${ctx.userName || "User"} | Role: ${ctx.role || "?"} (${roleDesc}) | Current Page: ${ctx.currentPage || "unknown"} | CDS Account: ${ctx.cdsNumber || "not selected"}
</user_context>

<system_knowledge>
## Pages & Navigation
- **Dashboard**: Portfolio overview — total market value, cost basis, unrealized/realized gain/loss, dividend income YTD, holdings count. Performance chart with 1W/1M/3M/6M/1Y/ALL ranges.
- **Portfolio (Companies)**: View all company holdings. Click a company to see interactive price chart (7D/30D/90D/1Y), price history, and update CDS price. Desktop has action menu; mobile has tap-to-open detail popup.
- **Transactions**: Record Buy/Sell trades. Fields: date, company, type, quantity, price/share, broker, control number, remarks. System auto-calculates all DSE fees. Workflow: Pending → Confirmed (DE) → Verified (VR). Can also be Rejected by VR.
- **Dividends**: Track dividend income. Fields: company, declaration date, ex-date, payment date, dividend/share, shares held, withholding tax. Statuses: Declared → Ex-Date Passed → Paid.
- **Reports**: Generate PDF/Excel reports — Portfolio Statement, Transaction History, Gain/Loss Report (FIFO). Filter by date range, company, transaction type, broker.
- **User Management** (SA/AD only): Manage users, assign roles, activate/deactivate accounts, link CDS accounts.
- **System Settings** (SA only): Portal branding, homepage carousel, broker management, CDS accounts, company management, DSE price sync settings.

## Roles & Permissions
- **SA (Super Admin)**: Everything. System settings, user management, all data operations.
- **AD (Admin)**: User management, all analytics. No system configuration.
- **DE (Data Entrant)**: Create/confirm transactions, edit/delete dividends (if not paid), edit company data, set CDS prices.
- **VR (Verifier)**: Verify/reject transactions, view analytics. Cannot create or edit transactions.
- **RO (Read Only)**: View-only. Cannot edit, create, or delete anything.

## Transaction Fees (Auto-Calculated)
When entering a transaction, all fees are computed automatically from trade value (qty x price):
- **Broker Commission**: Tiered — 1.7% on first 10M TZS, 1.5% on 10M-50M, 0.8% above 50M, plus 18% VAT
- **CMSA Fee**: 0.14% (Capital Markets and Securities Authority)
- **DSE Fee**: 0.14% + 18% VAT
- **CSDR Fee**: 0.06% + 18% VAT (Central Securities Depository)
- **Fidelity Insurance**: 0.02%
- **Buy**: Grand Total = Trade Value + Total Fees
- **Sell**: Grand Total = Trade Value - Total Fees

## FIFO Cost Basis
The system uses First-In-First-Out method:
- When shares are sold, they match against the oldest purchases first
- Realized gain/loss = Sale proceeds - FIFO cost of those specific shares
- Unrealized gain/loss = Current market value - Cost basis of remaining shares
- Critical for tax reporting in Tanzania

## CDS Accounts
- Each user can have multiple CDS (Central Depository System) accounts
- All transactions, dividends, and holdings are scoped to the active CDS account
- Switch accounts via the account switcher in the header
- CDS accounts must be activated by SA/AD for non-SA users

## Price Synchronization
- System-level: SA can enable auto-fetch from DSE API (every 5 min during market hours 09:00-17:00 EAT, Mon-Fri)
- User-level: DE/VR can set custom CDS prices for personal analysis
- If no custom price set, system uses DSE market price
- Price chart shows historical data with interactive hover

## Reports
1. **Portfolio Statement**: Current holdings — company, qty, avg cost, current price, market value, unrealized G/L
2. **Transaction History**: All trades in date range — with itemized fee breakdown
3. **Gain/Loss Report**: FIFO-based realized + unrealized gains per company

## Authentication
- Email/password login or Passkey/biometric login (fingerprint, face)
- Passkeys managed in Profile page
- Auto-logout after idle period
</system_knowledge>

<tanzania_dse_knowledge>
## Dar es Salaam Stock Exchange (DSE)
- Located in Dar es Salaam, Tanzania
- Trading hours: Monday-Friday, 09:00-16:00 EAT (East Africa Time, UTC+3)
- Settlement cycle: T+3 (trade date + 3 business days)
- Currency: Tanzanian Shilling (TZS)
- Currently 28 listed equities including: NMB, CRDB, TBL, VODA, DSE, SWIS, TCC, TCCL, PAL, TOL, TPCC, TTP, MCB, MKCB, DCB, MUCOBA, NICO, MBP, AFRIPRISE, plus ETFs (IEACLC-ETF, VERTEX-ETF)
- Main indices: DSE All Share Index (DSEI), Tanzania Share Index (TSI)

## Price Limits
- Daily price movement caps: typically +/- 5% from previous closing price
- Circuit breakers may halt trading if index moves beyond threshold

## Taxation (Tanzania)
- **Withholding Tax (WHT) on Dividends**: 5% for DSE-listed companies (reduced rate to encourage market participation), 10% for unlisted
- **Capital Gains Tax (CGT)**: 10% for residents on gains from listed securities, 30% for non-residents
- Gains calculated on FIFO basis
- Broker witholds CGT at source on sell transactions
- Annual tax reporting required to Tanzania Revenue Authority (TRA)

## Regulatory Bodies
- **CMSA (Capital Markets and Securities Authority)**: Primary regulator of Tanzania's capital markets
- **DSE (Dar es Salaam Stock Exchange)**: The stock exchange operator
- **CSDR (Central Securities Depository)**: Holds securities in electronic form, manages CDS accounts
- **Bank of Tanzania (BoT)**: Central bank, oversees monetary policy

## CDS Accounts
- Required for any share trading on DSE
- Opened through a licensed broker or CSDR directly
- Unique account number assigned to each investor
- Holds all securities in dematerialized (electronic) form
- Records all share transfers and corporate actions

## Licensed Brokers (Major)
- CRDB Bank Capital Markets, Orbit Securities, Zan Securities, Vertex International Securities, Core Securities, Umoja Wealth Management, among others
- All brokers must be licensed by CMSA

## Corporate Actions
- **Dividends**: Companies declare interim or final dividends; ex-date determines eligibility
- **Rights Issues**: Existing shareholders can buy additional shares at discounted price
- **Bonus Shares**: Free additional shares distributed proportionally
- **Stock Splits**: Increase share count, reduce price proportionally
- **IPOs**: Initial Public Offering — new company listing on DSE

## Investment Basics
- Minimum trade: No fixed minimum lot size on DSE (varies by broker)
- Foreign investors allowed with some restrictions
- Cross-listed companies: Some companies listed on multiple East African exchanges
</tanzania_dse_knowledge>`;
}

// ── Convert chat messages to Gemini format ────────────────────────
function toGeminiContents(messages: { role: string; content: string }[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

// ── Main handler ──────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: require valid JWT ──────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── Parse request ───────────────────────────────────────────
    const body = await req.json();
    const { messages, context } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array required" }, 400);
    }

    if (!GEMINI_API_KEY) {
      return json({ error: "AI service not configured" }, 503);
    }

    // ── Check if AI assistant is enabled ────────────────────────
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "ai_assistant_enabled")
        .single();
      if (data?.value?.enabled === false) {
        return json({ error: "AI assistant is currently disabled" }, 403);
      }
    } catch (_) {
      // No setting found = enabled by default
    }

    // ── Build system prompt + select model ──────────────────────
    const systemPrompt = buildSystemPrompt(context || {});
    const lastMessage = messages[messages.length - 1]?.content || "";
    const model = pickModel(lastMessage);

    // ── Call Gemini API ─────────────────────────────────────────
    const geminiUrl = `${GEMINI_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: toGeminiContents(messages),
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
      }),
    });
    clearTimeout(timeoutId);

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", geminiRes.status, errText);
      return json({ error: "AI service unavailable", detail: geminiRes.status }, 502);
    }

    const geminiData = await geminiRes.json();
    const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!reply) {
      return json({ error: "No response from AI" }, 502);
    }

    return json({ reply, model });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return json({ error: "AI request timed out" }, 504);
    }
    console.error("Chat function error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
