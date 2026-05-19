// ── Theme toggle ────────────────────────────────────────────────────────────
// Reads localStorage on load so the chosen theme survives page refreshes.
// Applies .theme-dark / .theme-light on <html>; tokens.css does the rest.

(function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved === 'dark' || (!saved && prefersDark);

  document.documentElement.classList.toggle('theme-dark', isDark);
  document.documentElement.classList.toggle('theme-light', !isDark);

  const checkbox = document.getElementById('theme-toggle');
  if (checkbox) checkbox.checked = isDark;
})();

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.toggle('theme-dark');
  html.classList.toggle('theme-light', !isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');

  const checkbox = document.getElementById('theme-toggle');
  if (checkbox) checkbox.checked = isDark;
}

const themeCheckbox = document.getElementById('theme-toggle');
if (themeCheckbox) {
  themeCheckbox.addEventListener('change', toggleTheme);
}

// ── Project search ───────────────────────────────────────────────────────────
search.addEventListener('input', () => {
  const term = search.value.toLowerCase();

  cards.forEach(card => {
    card.style.display =
      card.textContent.toLowerCase().includes(term)
        ? 'block'
        : 'none';
  });
});

// ── Live Market Data ─────────────────────────────────────────────────────────
// Replace 'YOUR_KEY_HERE' with your Alpha Vantage API key.
// Free tier: 25 requests/day. With 6 assets, each full refresh costs 6 calls.
const API_KEY = 'W4OQ0BD76CRSL3O6';

const FX_PAIRS = [
  { from: 'GBP', to: 'USD' },
  { from: 'EUR', to: 'USD' },
  { from: 'USD', to: 'JPY' },
];

const EQUITIES = [
  { symbol: 'AAPL' },
  { symbol: 'TSLA' },
  { symbol: 'MSFT' },
];

const AV_BASE = 'https://www.alphavantage.co/query';

async function avFetch(params) {
  const url = new URL(AV_BASE);
  Object.entries({ ...params, apikey: API_KEY }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Network error (HTTP ${res.status})`);
  const data = await res.json();
  if (data['Note'] || data['Information']) {
    throw new Error('API rate limit reached — free tier allows 25 calls/day');
  }
  return data;
}

async function fetchFxRate(from, to) {
  const data = await avFetch({ function: 'CURRENCY_EXCHANGE_RATE', from_currency: from, to_currency: to });
  const r = data['Realtime Currency Exchange Rate'];
  if (!r) throw new Error('Unexpected API response');
  return {
    pair: `${from}/${to}`,
    rate: parseFloat(r['5. Exchange Rate']),
    bid:  parseFloat(r['8. Bid Price']),
    ask:  parseFloat(r['9. Ask Price']),
  };
}

async function fetchEquity(symbol) {
  const data = await avFetch({ function: 'GLOBAL_QUOTE', symbol });
  const q = data['Global Quote'];
  if (!q || !q['05. price']) throw new Error('Unexpected API response');
  return {
    symbol:    q['01. symbol'],
    price:     parseFloat(q['05. price']),
    change:    parseFloat(q['09. change']),
    changePct: q['10. change percent'],
    prevClose: parseFloat(q['08. previous close']),
    latestDay: q['07. latest trading day'],
  };
}

function fxDecimals(pair) { return pair.includes('JPY') ? 3 : 5; }
function fmtRate(v, pair)  { return v.toFixed(fxDecimals(pair)); }
function fmtUSD(v)         { return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function skeletonCards(labels) {
  return labels.map(label => `
    <li class="ticker-card ticker-card--loading" aria-busy="true">
      <div class="ticker-card__left">
        <span class="ticker-card__symbol">${label}</span>
        <span class="ticker-card__meta">FETCHING...</span>
      </div>
      <div class="ticker-card__right">
        <span class="ticker-card__price">&#x2013;&#x2013;&#x2013;</span>
        <span class="ticker-card__change">&#x2013;&#x2013;&#x2013;</span>
      </div>
    </li>`).join('');
}

function fxCard(d) {
  const spread = (d.ask - d.bid).toFixed(fxDecimals(d.pair));
  return `
    <li class="ticker-card" id="t-${d.pair.replace('/', '')}">
      <div class="ticker-card__left">
        <span class="ticker-card__symbol">${d.pair}</span>
        <span class="ticker-card__meta">BID ${fmtRate(d.bid, d.pair)} &middot; ASK ${fmtRate(d.ask, d.pair)}</span>
      </div>
      <div class="ticker-card__right">
        <span class="ticker-card__price">${fmtRate(d.rate, d.pair)}</span>
        <span class="ticker-card__change">SPR ${spread}</span>
      </div>
    </li>`;
}

function equityCard(d) {
  const up    = d.change >= 0;
  const dir   = up ? 'up' : 'down';
  const arrow = up ? '&#x25B2;' : '&#x25BC;';
  const sign  = up ? '+' : '';
  const pct   = d.changePct.replace('%', '').trim();
  return `
    <li class="ticker-card ticker-card--${dir}" id="t-${d.symbol}">
      <div class="ticker-card__left">
        <span class="ticker-card__symbol">${d.symbol}</span>
        <span class="ticker-card__meta">PREV $${fmtUSD(d.prevClose)} &middot; ${d.latestDay}</span>
      </div>
      <div class="ticker-card__right">
        <span class="ticker-card__price">$${fmtUSD(d.price)}</span>
        <span class="ticker-card__change">${arrow} ${sign}${d.change.toFixed(2)} (${sign}${pct}%)</span>
      </div>
    </li>`;
}

function errorCard(label) {
  return `
    <li class="ticker-card ticker-card--error">
      <div class="ticker-card__left">
        <span class="ticker-card__symbol">${label}</span>
        <span class="ticker-card__meta">FAILED</span>
      </div>
      <div class="ticker-card__right">
        <span class="ticker-card__change">&#x2013;&#x2013;&#x2013;</span>
      </div>
    </li>`;
}

async function refreshMarketData() {
  const fxList      = document.getElementById('fx-list');
  const eqList      = document.getElementById('equity-list');
  const errorBanner = document.getElementById('market-error');
  const updatedEl   = document.getElementById('market-updated');
  if (!fxList || !eqList) return;

  errorBanner.hidden = true;
  fxList.innerHTML = skeletonCards(FX_PAIRS.map(p => `${p.from}/${p.to}`));
  eqList.innerHTML = skeletonCards(EQUITIES.map(e => e.symbol));

  const [fxResults, eqResults] = await Promise.all([
    Promise.allSettled(FX_PAIRS.map(p  => fetchFxRate(p.from, p.to))),
    Promise.allSettled(EQUITIES.map(e  => fetchEquity(e.symbol))),
  ]);

  function maybeShowBanner(reason) {
    if (!errorBanner.hidden) return;
    errorBanner.textContent = `// ERROR: ${reason.message}`;
    errorBanner.hidden = false;
  }

  fxList.innerHTML = fxResults.map((r, i) => {
    if (r.status === 'fulfilled') return fxCard(r.value);
    maybeShowBanner(r.reason);
    return errorCard(`${FX_PAIRS[i].from}/${FX_PAIRS[i].to}`);
  }).join('');

  eqList.innerHTML = eqResults.map((r, i) => {
    if (r.status === 'fulfilled') return equityCard(r.value);
    maybeShowBanner(r.reason);
    return errorCard(EQUITIES[i].symbol);
  }).join('');

  if (updatedEl) {
    updatedEl.textContent = `UPDATED ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }
}

(function initMarket() {
  if (!document.getElementById('market')) return;

  let countdown = 60;
  const countdownEl = document.getElementById('market-countdown');

  function tick() {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;
    if (countdown <= 0) {
      countdown = 60;
      refreshMarketData();
    }
  }

  refreshMarketData();
  setInterval(tick, 1000);
}());