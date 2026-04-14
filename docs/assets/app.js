// Collapsible sections

function collapseSection(section) {
  const body = section.querySelector('.section-body');
  const btn = section.querySelector('.section-toggle');

  // Capture current height before collapsing
  body.style.maxHeight = body.scrollHeight + 'px';
  // Force reflow so transition fires from current height → 0
  body.offsetHeight; // eslint-disable-line no-unused-expressions
  body.style.maxHeight = '0';
  body.style.opacity = '0';

  btn.setAttribute('aria-expanded', 'false');
}

function expandSection(section) {
  const body = section.querySelector('.section-body');
  const btn = section.querySelector('.section-toggle');

  btn.setAttribute('aria-expanded', 'true');
  body.style.maxHeight = body.scrollHeight + 'px';
  body.style.opacity = '1';

  // After transition, remove explicit max-height so content can grow freely
  // (e.g. images loading late)
  body.addEventListener('transitionend', () => {
    if (btn.getAttribute('aria-expanded') === 'true') {
      body.style.maxHeight = 'none';
    }
  }, { once: true });
}

function initSections() {
  document.querySelectorAll('.news-section').forEach(section => {
    const body = section.querySelector('.section-body');
    const btn = section.querySelector('.section-toggle');
    if (!body || !btn) return;

    // Set initial max-height so collapse transition has a known start point
    body.style.maxHeight = body.scrollHeight + 'px';

    btn.addEventListener('click', () => {
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        collapseSection(section);
      } else {
        expandSection(section);
      }
    });
  });
}

// Collapse-all / expand-all controls (added dynamically if >2 sections)
function addCollapseControls() {
  const grid = document.querySelector('.sections-grid');
  const sections = document.querySelectorAll('.news-section');
  if (!grid || sections.length < 2) return;

  const bar = document.createElement('div');
  bar.className = 'collapse-controls';
  bar.innerHTML = `
    <button class="ctrl-btn" id="expand-all">Expand all</button>
    <button class="ctrl-btn" id="collapse-all">Collapse all</button>
  `;

  // Insert before the sections grid
  grid.parentNode.insertBefore(bar, grid);

  document.getElementById('expand-all').addEventListener('click', () => {
    sections.forEach(s => {
      if (s.querySelector('.section-toggle').getAttribute('aria-expanded') === 'false') {
        expandSection(s);
      }
    });
  });

  document.getElementById('collapse-all').addEventListener('click', () => {
    sections.forEach(s => {
      if (s.querySelector('.section-toggle').getAttribute('aria-expanded') === 'true') {
        collapseSection(s);
      }
    });
  });
}

// Lazy-load OG images: update max-height after image loads
function patchImageHeights() {
  document.querySelectorAll('.og-thumb').forEach(img => {
    img.addEventListener('load', () => {
      const body = img.closest('.section-body');
      const btn = body && body.closest('.news-section')?.querySelector('.section-toggle');
      if (body && btn && btn.getAttribute('aria-expanded') === 'true' && body.style.maxHeight !== 'none') {
        body.style.maxHeight = body.scrollHeight + 'px';
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initSections();
  addCollapseControls();
  patchImageHeights();
});

// Inject collapse controls styles
const style = document.createElement('style');
style.textContent = `
  .collapse-controls {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  .ctrl-btn {
    background: none;
    border: 1px solid var(--border, #e4e2da);
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    color: var(--text-muted, #71717a);
    transition: background 0.15s, color 0.15s;
    font-family: inherit;
  }
  .ctrl-btn:hover {
    background: var(--text, #1a1a2e);
    color: white;
    border-color: transparent;
  }
`;
document.head.appendChild(style);
