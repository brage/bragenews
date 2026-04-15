#!/usr/bin/env node
/**
 * build.js — Generates docs/ from news/*.md
 * Usage:
 *   node build.js          # full build, fetches OG images
 *   node build.js --no-fetch  # skip OG image fetching (fast)
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';

const FETCH_OG = !process.argv.includes('--no-fetch');
const NEWS_DIR = 'news';
const DOCS_DIR = 'docs';
const OG_CACHE_FILE = '.og-cache.json';
const OG_TIMEOUT_MS = 6000;

// ─── Category definitions ────────────────────────────────────────────────────

const CATEGORIES = {
  'Microsoft Fabric': { id: 'fabric',    emoji: '🏗️',  label: 'Microsoft Fabric' },
  'Databricks':       { id: 'databricks', emoji: '🧱',  label: 'Databricks' },
  'AI News':          { id: 'ai',        emoji: '🤖',  label: 'AI News' },
  'Norwegian Microsoft Partners': { id: 'partners', emoji: '🤝', label: 'Partners' },
  'Market Signals':   { id: 'market',    emoji: '📊',  label: 'Market Signals' },
};

function detectCategory(title) {
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (title.includes(key) || key.includes(title)) return cat;
  }
  // Partial match on first word
  const firstWord = title.split(' ')[0];
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (key.includes(firstWord)) return cat;
  }
  return { id: 'misc', emoji: '📰', label: title };
}

// ─── OG image fetching ───────────────────────────────────────────────────────

async function fetchOgImage(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OG_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BrageNewsBot/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    // Match both attribute orderings of og:image
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const src = m?.[1]?.trim();
    // Reject data URIs and suspiciously short values
    if (src && src.startsWith('http') && src.length > 10) return src;
    return null;
  } catch {
    return null;
  }
}

function extractUrls(content) {
  const urls = new Set();
  const re = /\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) urls.add(m[1]);
  return [...urls];
}

// ─── Markdown parsing ────────────────────────────────────────────────────────

/**
 * Split markdown content into sections by H2 heading.
 * Returns array of { title, content, html, category }.
 */
function parseSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { title: line.slice(3).trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
    // Lines before first H2 (title, blank lines) are skipped
  }
  if (current) sections.push(current);

  return sections.map(s => {
    // Trim trailing HR and generated footer note
    const trimmed = [...s.lines];
    while (trimmed.length > 0) {
      const last = trimmed[trimmed.length - 1].trim();
      if (last === '' || last === '---' || last.startsWith('*Generated')) {
        trimmed.pop();
      } else break;
    }

    const sectionContent = trimmed.join('\n');
    return {
      title: s.title,
      content: sectionContent,
      html: marked.parse(sectionContent),
      category: detectCategory(s.title),
    };
  });
}

/**
 * Post-process section HTML: wrap list items that have a link with an OG thumbnail.
 */
function injectOgImages(html, ogCache) {
  return html.replace(/<li>([\s\S]*?)<\/li>/g, (match, inner) => {
    const urlMatch = inner.match(/href="(https?:\/\/[^"]+)"/);
    if (urlMatch) {
      const og = ogCache[urlMatch[1]];
      if (og) {
        return `<li class="has-og">` +
          `<div class="article-body">${inner}</div>` +
          `<img class="og-thumb" src="${og}" alt="" loading="lazy" ` +
          `onerror="this.parentElement.classList.remove('has-og');this.remove()">` +
          `</li>`;
      }
    }
    return match;
  });
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function tagHtml(cat) {
  return `<span class="tag tag-${cat.id}">${cat.emoji} ${cat.label}</span>`;
}

function htmlHead({ title, cssPath, description = '' }) {
  return `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${description ? `<meta name="description" content="${description}">` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${cssPath}">
</head>`;
}

function siteHeader(logoHref) {
  return `<header class="site-header">
  <div class="container">
    <a href="${logoHref}" class="logo">
      <span class="logo-mark" aria-hidden="true">⚡</span>
      Brage News
    </a>
    <span class="header-tagline">Norwegian tech &amp; data digest</span>
  </div>
</header>`;
}

function siteFooter(slug) {
  return `<footer class="site-footer">
  <div class="container">
    Generated by the <a href="https://github.com/brage/bragenews">fetch-news skill</a>${slug ? ` · ${slug}` : ''}
  </div>
</footer>`;
}

// ─── Page generators ──────────────────────────────────────────────────────────

function generateDigestPage({ filename, frontmatter, sections }, ogCache) {
  const slug = filename.replace('.md', '');
  const date = frontmatter.date || slug;
  const title = frontmatter.title || `News Digest — ${date}`;
  const items = frontmatter.items ?? '?';

  // Format date for display
  let dateFormatted = slug;
  try {
    dateFormatted = new Date(slug + 'T12:00:00Z').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { /* use raw string */ }

  const sectionsHtml = sections.map(s => {
    const cat = s.category;
    const bodyHtml = injectOgImages(s.html, ogCache);
    return `
<section class="news-section" data-cat="${cat.id}">
  <button class="section-toggle" aria-expanded="true">
    <span class="section-label">
      <span class="section-emoji" aria-hidden="true">${cat.emoji}</span>
      <span class="section-title">${s.title}</span>
    </span>
    <span class="chevron" aria-hidden="true"></span>
  </button>
  <div class="section-body">
    <div class="section-body-inner">
      ${bodyHtml}
    </div>
  </div>
</section>`;
  }).join('\n');

  const topicTags = sections.map(s => tagHtml(s.category)).join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
${htmlHead({ title: `${title} — Brage News`, cssPath: '../assets/style.css' })}
<body>
${siteHeader('../')}

<main class="container">
  <div class="digest-hero">
    <a href="../" class="back-link">← All digests</a>
    <h1 class="digest-title">${title}</h1>
    <div class="digest-meta">
      <span class="meta-badge meta-date">${dateFormatted}</span>
      <span class="meta-badge">${items} items</span>
      <div class="tags">
        ${topicTags}
      </div>
    </div>
  </div>

  <div class="sections-grid">
    ${sectionsHtml}
  </div>
</main>

${siteFooter(String(date))}
<script src="../assets/app.js"></script>
</body>
</html>`;
}

function generateIndexPage(digests, ogCache) {
  const cards = digests.map(d => {
    const slug = d.filename.replace('.md', '');
    const date = d.frontmatter.date || slug;
    const title = d.frontmatter.title || `News Digest — ${date}`;
    const items = d.frontmatter.items ?? '?';

    // Format date for display (use slug — always YYYY-MM-DD string, avoids
    // gray-matter parsing YAML dates as JS Date objects which breaks concat)
    let dateFormatted = slug;
    try {
      dateFormatted = new Date(slug + 'T12:00:00Z').toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch { /* use raw string */ }

    // Tags from sections
    const tags = d.sections.map(s => tagHtml(s.category)).join('\n        ');

    // Cover image: frontmatter → first cached OG image in content
    let coverImg = d.frontmatter.cover_image || null;
    if (!coverImg) {
      const urls = extractUrls(d.rawContent);
      coverImg = urls.map(u => ogCache[u]).find(Boolean) || null;
    }

    const coverHtml = coverImg
      ? `<div class="card-cover">
          <img src="${coverImg}" alt="" loading="lazy" onerror="this.parentElement.classList.add('no-cover');this.remove()">
        </div>`
      : `<div class="card-cover no-cover"></div>`;

    return `
<a href="news/${slug}.html" class="digest-card">
  ${coverHtml}
  <div class="card-body">
    <div class="card-date">${dateFormatted}</div>
    <h2 class="card-title">${title}</h2>
    <div class="card-tags">
      ${tags}
    </div>
    <div class="card-footer">
      <span class="card-count">${items} items</span>
      <span class="card-arrow">→</span>
    </div>
  </div>
</a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
${htmlHead({
  title: 'Brage News — Norwegian tech & data digest',
  cssPath: 'assets/style.css',
  description: 'Daily digest of Microsoft Fabric, AI, and Norwegian tech partner news.',
})}
<body>
${siteHeader('./')}

<main class="container">
  <div class="index-hero">
    <h1>Latest Digests</h1>
    <p class="index-subtitle">Curated news on Microsoft Fabric, AI, and the Norwegian data partner ecosystem — updated daily.</p>
  </div>

  <div class="digest-grid">
    ${cards}
  </div>
</main>

${siteFooter(null)}
<script src="assets/app.js"></script>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function build() {
  console.log(`\n🔨 Building Brage News site${FETCH_OG ? '' : ' (--no-fetch)'}\n`);

  // Load OG cache
  let ogCache = {};
  if (fs.existsSync(OG_CACHE_FILE)) {
    ogCache = JSON.parse(fs.readFileSync(OG_CACHE_FILE, 'utf8'));
    console.log(`📦 Loaded OG cache (${Object.keys(ogCache).length} entries)`);
  }

  // Read all news files, newest first
  const newsFiles = fs.readdirSync(NEWS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();

  if (newsFiles.length === 0) {
    console.error('No news files found in news/');
    process.exit(1);
  }

  const digests = [];

  for (const filename of newsFiles) {
    const filepath = path.join(NEWS_DIR, filename);
    const raw = fs.readFileSync(filepath, 'utf8');
    const { data: frontmatter, content } = matter(raw);
    const sections = parseSections(content);
    const rawContent = content;

    process.stdout.write(`📄 ${filename}`);

    if (FETCH_OG) {
      const urls = extractUrls(content);
      const uncached = urls.filter(u => !(u in ogCache));
      if (uncached.length > 0) {
        process.stdout.write(` — fetching ${uncached.length} OG images`);
        let hits = 0;
        for (const url of uncached) {
          const og = await fetchOgImage(url);
          ogCache[url] = og;
          if (og) hits++;
          process.stdout.write('.');
        }
        process.stdout.write(` (${hits} found)`);
      }
    }

    console.log();
    digests.push({ filename, frontmatter, sections, rawContent });
  }

  // Persist OG cache
  fs.writeFileSync(OG_CACHE_FILE, JSON.stringify(ogCache, null, 2));
  console.log(`\n💾 OG cache saved (${Object.keys(ogCache).length} entries)`);

  // Create output dirs
  fs.mkdirSync(path.join(DOCS_DIR, 'news'), { recursive: true });
  fs.mkdirSync(path.join(DOCS_DIR, 'assets'), { recursive: true });

  // Generate digest pages
  for (const digest of digests) {
    const html = generateDigestPage(digest, ogCache);
    const outFile = path.join(DOCS_DIR, 'news', digest.filename.replace('.md', '.html'));
    fs.writeFileSync(outFile, html);
    console.log(`✅ ${outFile}`);
  }

  // Generate index page
  const indexHtml = generateIndexPage(digests, ogCache);
  fs.writeFileSync(path.join(DOCS_DIR, 'index.html'), indexHtml);
  console.log(`✅ ${path.join(DOCS_DIR, 'index.html')}`);

  console.log('\n✨ Build complete!\n');
}

build().catch(err => {
  console.error('\n❌ Build failed:', err);
  process.exit(1);
});
