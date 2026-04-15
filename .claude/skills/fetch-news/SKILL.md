---
name: fetch-news
description: Fetch a daily news digest covering Microsoft Fabric, AI news (Claude/OpenAI), Norwegian Microsoft partners (press releases and job openings), and Norwegian market signals around Fabric/Databricks. Stores results as markdown in bragenews/news/ and builds HTML pages via build.js. Deduplicates against previously seen URLs. Triggered by "fetch news", "what's new", "hent nyheter", or similar phrases — optionally with topic filters like "fetch news on Fabric only" or "focus on job openings".
---

# fetch-news

Fetch a daily news digest and store it in the bragenews repository.

## Repository root
`/Users/brage/Documents/code/bragenews/`

## Dedup cache
`/Users/brage/Documents/code/bragenews/.seen/urls.json`
Format: `{ "urls": ["https://...", ...] }`

Read this file at the start of every run. If it doesn't exist, treat the seen-set as empty. After writing the digest, append all newly written URLs and save the file back.

## Scope

If the user provides extra instructions (e.g. "only job openings", "focus on Fabric", "skip partners"), restrict the run to those topics. Otherwise run all five topics below.

---

## Step 1 — Load dedup cache

Read `/Users/brage/Documents/code/bragenews/.seen/urls.json`. Collect all URLs into a set called `seen_urls`. If the file is missing or empty, `seen_urls = []`.

---

## Step 2 — Fetch topics

For each topic, use WebSearch to find recent items. Use WebFetch to read the full page for any result that looks valuable but whose snippet is too thin. Only include items published within the last 14 days. Skip any URL already in `seen_urls`.

### Topic A — Microsoft Fabric

Run these searches (pick the most useful 4–6 results across all):
- `"Microsoft Fabric" announcement OR release OR update 2026`
- `"Microsoft Fabric" site:techcommunity.microsoft.com`
- `"Microsoft Fabric" site:microsoft.com/en-us/microsoft-fabric`
- `Fabric lakehouse OR "real-time intelligence" OR "data factory" news 2026`

### Topic B — AI News

Run these searches (pick 4–6 results):
- `site:anthropic.com Claude new features OR release OR announcement`
- `OpenAI GPT new model OR feature release 2026`
- `Microsoft Copilot AI announcement 2026`
- `AI news this week LLM model release`

### Topic C — Norwegian Microsoft Partners: Press Releases

Partners to cover: **Atea, Crayon, Sopra Steria, Bouvet, Miles, Computas, Itera**

For each partner, run:
- `"{partner}" pressmelding OR "press release" OR nyhet Microsoft 2026`
- `site:{partner-domain} news OR blog 2026`  
  (domains: atea.no, crayon.com/no, soprasteria.no, bouvet.no, miles.no, computas.com, itera.no)

Collect the most recent 1–2 items per partner. Skip partners with no new results.

### Topic D — Norwegian Microsoft Partners: Job Openings

For each partner, search:
- `"{partner}" ledig stilling OR "data engineer" OR "AI engineer" OR "Fabric" OR "Databricks" 2026`
- `finn.no "{partner}" data OR AI OR Fabric OR Databricks`

Collect open roles that are clearly data/AI/Fabric/Databricks oriented. Include role title, partner, and link.

### Topic E — Market Signals (Potential Customers)

Norwegian companies evaluating or adopting data platforms. Searches:
- `norsk selskap "Microsoft Fabric" OR "Databricks" 2026`
- `"vi har valgt" OR "vi innfører" OR "satser på" Fabric OR Databricks`
- `site:digi.no OR site:kode24.no OR site:computerworld.no Fabric OR Databricks 2026`
- `Norway company "Microsoft Fabric" OR "Databricks" announcement 2026`

Pick 3–5 items that indicate a Norwegian company is actively moving toward these platforms.

---

## Step 3 — Deduplicate and summarise

For each collected item:
- If the URL is already in `seen_urls`, skip it.
- Otherwise write a 2–4 sentence summary: what happened, why it matters for a Microsoft data/AI partner in Norway. Keep the original language if Norwegian, English otherwise.

---

## Step 4 — Write daily digest

File path: `/Users/brage/Documents/code/bragenews/news/YYYY-MM-DD.md`  
Use today's date. If the file already exists (re-run same day), append new items to each section rather than overwriting.

Always include a YAML frontmatter block at the top with: date, title, items (total count), topics (list of section names present), and `cover_image: null` (the build script fills this from OG cache).

```markdown
---
date: YYYY-MM-DD
title: News Digest — YYYY-MM-DD
items: X
topics:
  - Microsoft Fabric
  - AI News
  - Norwegian Partners
  - Market Signals
cover_image: null
---

# News Digest — YYYY-MM-DD

## Microsoft Fabric
- **[Title](url)** — Summary.

## AI News
- **[Title](url)** — Summary.

## Norwegian Microsoft Partners

### Press Releases
- **[Partner]** — **[Title](url)** — Summary.

### Job Openings
| Partner | Role | Link | Posted |
|---------|------|------|--------|
| Bouvet | Data Engineer – Fabric | [link](url) | YYYY-MM-DD |

## Market Signals
- **[Company / Source](url)** — Summary of why this is a potential opportunity.

---
*Generated: YYYY-MM-DD. X new items.*
```

Omit any section that has zero new items. Do not write placeholder text like "nothing found".

---

## Step 5 — Update dedup cache

Collect all URLs written in Step 4. Add them to the list from Step 1. Write the merged list back to `/Users/brage/Documents/code/bragenews/.seen/urls.json`.

---

## Step 6 — Build HTML

Run the following command from the repository root to regenerate all HTML pages in `docs/`:

```bash
cd /Users/brage/Documents/code/bragenews && node build.js
```

This converts all `news/*.md` files to `docs/news/*.html` and rebuilds `docs/index.html`. The build also fetches Open Graph images for new URLs and caches them in `.og-cache.json`.

If the build fails, report the error to the user but do not block the overall skill — the markdown digest is the primary output.

---

## Step 7 — Update index

Read `/Users/brage/Documents/code/bragenews/index.md`. Prepend a new line under the `## Digests` heading:

```
- [YYYY-MM-DD](news/YYYY-MM-DD.md) — X new items
```

If today's date is already listed (re-run), update the item count instead of adding a duplicate line.

---

## Done

Report a short summary to the user:
- How many new items were found per topic
- Path to the digest file and the generated HTML page (`docs/news/YYYY-MM-DD.html`)
- Any topics that returned zero new results
