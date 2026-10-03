# Client Finder

Client Finder turns a plain-language product or service description into an editable target profile, searches for possible B2B and B2C prospects, and scores returned candidates against that profile.

> Search results are leads to review, not verified buyers or proof of purchase intent. Tavily searches public web pages; Geoapify returns mapped places. Always check the source before contacting a prospect.

## How It Works

1. **Describe the offering.** Enter a product, service, audience, and location in natural language.
2. **Extract a target profile.** Groq (`openai/gpt-oss-20b`) converts the description into an audience type, category, geography, company size, consumer segment, keywords, budget signal, and summary.
3. **Review and edit.** Confirm or change the extracted profile before discovery.
4. **Search for candidates.**
    - **B2B:** Tavily searches the web using the product, geography, audience, and keywords. Social/platform domains and market reports are filtered. List pages are kept separately; Groq extracts only company names supported by exact quotes from the page. Groq classifies every candidate, and only a named single company can qualify. Results still do not establish that a company wants to buy.
   - **B2C:** Geoapify searches mapped points of interest near a geocoded location. It returns places, not individual consumers. It cannot identify farmers as people, and farm/farmer profiles currently return a notice instead of unrelated businesses.
5. **Verify companies and find public contact details.** Groq verifies B2B company identity. For list-derived prospects, it verifies the extracted company rather than the list publisher. The server uses a source domain only if it is verified as the company's own site; otherwise Tavily looks up the official site. Contact/about pages are scraped only on a verified domain, and Tavily contact search is restricted to that domain. B2C uses the contact fields included in Geoapify place data. Contact information is optional and its source is recorded.
6. **Score and filter.** A separate Groq key scores every verified candidate in batches and gives a short rationale. Scores use a calibrated fit rubric that includes plausible or adjacent prospects; missing contact details and unproven purchase intent do not automatically lower fit. Only candidates scoring **40 or higher** are displayed. There is no five-result target or early stop; malformed JSON batches are retried as smaller batches, and other batch failures do not discard successful results or prevent later batches from running.
7. **Review results.** Filter by B2B/B2C, sort by fit score or name, inspect details, contact the organization, and open the provider source or map link.

The discovery loading screen receives live server progress events for searching, company verification/contact enrichment, and scoring. Heartbeats keep the streaming request active during longer searches or Groq cooldowns.

## Technology

- **Client:** React, TypeScript, Vite, Tailwind CSS, and Lucide icons.
- **Server:** Node.js, Express, and ES modules.
- **Profile extraction, verification, and scoring:** GroqCloud via `groq-sdk`, using `openai/gpt-oss-20b` with separate API keys per stage.
- **B2B discovery:** Tavily Search API.
- **B2C discovery:** Geoapify Geocoding and Places APIs.

## Requirements

- Node.js 20.19+ or 22.12+ (a current Node.js LTS release is recommended).
- API keys for Groq, Tavily, and Geoapify. Groq is required for extraction and scoring. Tavily is required for B2B web search. Geoapify is required for B2C place discovery.

## Setup

From the repository root:

```powershell
npm install
npm --prefix client install
npm --prefix server install
Copy-Item .env.example .env
```

Add your API keys to `.env`:

```dotenv
GROQ_API_KEY1=your_first_groq_api_key
GROQ_API_KEY2=your_second_groq_api_key
GROQ_API_KEY3=your_third_groq_api_key
GROQ_TPM_BUDGET=6500
TAVILY_API_KEY=your_tavily_api_key
GEOAPIFY_API_KEY=your_geoapify_api_key
PORT=5000
```

Keep `.env` private. It is ignored by Git; `.env.example` contains blank placeholders and is safe to commit.

Start the client and API together:

```powershell
npm run dev
```

Vite serves the client at `http://localhost:5173` and proxies `/api` calls to the Express server at `http://localhost:5000`. Keep the server running while using the client. If the UI reports an HTTP 502 or Vite reports `ECONNREFUSED`, check that the backend is running on port 5000.

Run either process separately when needed:

```powershell
npm run client
npm run server
```

Create a production client build:

```powershell
npm run build
```

Run the server regression tests:

```powershell
node --test server/tests/real-input-only.test.js server/tests/tavily-service.test.js server/tests/geoapify-service.test.js server/tests/scoring-target.test.js server/tests/contact-enrichment.test.js server/tests/company-candidate.test.js server/tests/groq-request-queue.test.js server/tests/groq-config.test.js
```

## Environment Variables

| Variable | Required for | Description |
| --- | --- | --- |
| `GROQ_API_KEY1` | Profile extraction and list-company extraction | Discovery/extraction Groq key. |
| `GROQ_API_KEY2` | Company identity and source-site verification | Verification Groq key. |
| `GROQ_API_KEY3` | Lead fit scoring | Scoring Groq key. |
| `GROQ_API_KEY` | Legacy fallback | Used for a role only when that role's dedicated key is unset. |
| `GROQ_TPM_BUDGET` | Groq request pacing | Estimated server-wide tokens per rolling minute; defaults to `6500` for headroom below an 8000 TPM plan. |
| `TAVILY_API_KEY` | B2B discovery | Tavily API key for web search. |
| `GEOAPIFY_API_KEY` | B2C discovery | Geoapify API key for geocoding and Places search. |
| `PORT` | Server | Express listen port; defaults to `5000`. |

The backend loads `.env` from the repository root, with an optional fallback to `server/.env`.

## API

All request bodies and responses are JSON.

### `GET /api/health`

Returns server status and whether each API key is configured. It does not return key values.

### `POST /api/extract-profile`

Request:

```json
{
  "description": "A booking platform that helps Austin medical clinics schedule patients and reduce missed appointments."
}
```

Success includes `data` with the structured profile and `meta` with the Groq model and live status.

### `POST /api/discover`

Runs discovery based on `profile.audience_type`, which can be `B2B`, `B2C`, or `both`.

Request:

```json
{
  "profile": {
    "audience_type": "both",
    "category": "Medical appointment scheduling",
    "geography": "Austin, Texas",
    "target_company_size": "10-200 employees",
    "target_consumer_segment": "Local patients",
    "keywords": ["clinic booking", "patient scheduling"],
    "budget_scale_signal": "Mid-market",
    "summary": "Help clinics reduce missed appointments."
  }
}
```

The response includes qualified leads in `data` and metadata in `meta`, including per-audience evaluated counts and provider/scoring notices.

### `POST /api/discover-b2b`

Runs the Tavily B2B search and qualification flow for the provided `profile`.

### `POST /api/discover-b2c`

Runs the Geoapify B2C place search and qualification flow for the provided `profile`.

## Current Limits and Interpretation

- Every candidate returned by the initial Tavily/Geoapify search is processed; B2B list pages can add separately extracted company candidates. Results below 40 are filtered from display.
- The results view shows five leads per page. Download Excel (CSV) exports all discovered leads, including those on other pages and outside the current table filter; the CSV can be opened in spreadsheet apps such as Excel.
- Provider result limits and relevance determine how many candidates are available; the app does not run follow-up broad searches to hit a count target.
- Tavily's results are public web-search matches, not a structured business registry or verified contact database. List-derived company candidates must be named in a quoted source excerpt; official domains are matched against the extracted company name. A high fit score ranks available evidence against the profile; it does not confirm budget, authority, or purchase intent.
- Contact details are collected from verified public company sites or Geoapify place records. Sources are shown in the UI, but availability and accuracy are not guaranteed; phone/email deliverability is not verified.
- Geoapify returns places in its map database, not individual consumers. Location resolution and supported place categories affect coverage.
- Agriculture/farmer B2C discovery needs a farm directory, agricultural registry, or another farmer-level data source; Geoapify is not such a source.
- API provider outages, rate limits, invalid keys, unsupported place categories, and empty geographic coverage are surfaced as notices rather than replaced with demo leads.
- Groq calls are serialized within each server process, reserve estimated prompt-plus-completion tokens against a rolling-minute safety budget, use bounded retries for 429 responses, and keep prompts compact. The keys are assigned to extraction (`GROQ_API_KEY1`), verification (`GROQ_API_KEY2`), and scoring (`GROQ_API_KEY3`). Separate keys only reduce contention if Groq assigns them independent limits; keys in the same organization/model/service tier may share TPM quota. Account-wide limits can still be reached by other apps or when the free-tier quota is exhausted.
- This is a prototype. It does not currently provide user authentication, per-user API-key storage, persistent CRM records, or contact deliverability verification.

## Repository Layout

```text
client/                 React and TypeScript Vite application
client/src/components/  Profile, loading, results, and detail UI
server/index.js         Express API and discovery orchestration
server/groqService.js   Groq profile extraction
server/scoringService.js Groq scoring and qualification limits
server/tavilyService.js Tavily B2B web search
server/contactEnrichmentService.js Public B2B contact lookup
server/geoapifyService.js Geoapify B2C place search
server/tests/           Provider and scoring regression tests
.env.example            Blank environment variable template
```
