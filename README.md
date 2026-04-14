# bragenews

Daily news digest covering:

- **Microsoft Fabric** — announcements, releases, feature updates
- **AI News** — Claude, OpenAI, Microsoft Copilot
- **Norwegian Microsoft Partners** — press releases and data/AI job openings (Atea, Crayon, Sopra Steria, Bouvet, Miles, Computas, Itera)
- **Market Signals** — Norwegian companies adopting Fabric, Databricks, or similar platforms

## How it works

Triggered manually (or nightly) via the `fetch-news` Claude skill. Each run:

1. Searches the web for new items across all topics
2. Skips anything already seen in previous runs (`.seen/urls.json`)
3. Summarises each item and writes a daily digest to `news/YYYY-MM-DD.md`
4. Updates this index

## Digests

See [index.md](index.md) for the full list of daily digests.

## Structure

```
news/          ← one markdown file per day
.seen/         ← deduplication cache (not committed)
index.md       ← auto-updated digest index
```
