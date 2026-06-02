/* ── Nav: transparent → frosted glass on scroll ── */
const nav = document.getElementById('nav');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

/* ── Mobile hamburger ─────────────────────────── */
const burger   = document.getElementById('nav-burger');
const navLinks = document.getElementById('nav-links');

burger.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  burger.classList.toggle('open', isOpen);
  burger.setAttribute('aria-expanded', String(isOpen));
});

navLinks.addEventListener('click', e => {
  if (e.target.tagName === 'A') {
    navLinks.classList.remove('open');
    burger.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
  }
});

/* ── Active nav link on scroll ────────────────── */
const sections = document.querySelectorAll('section[id]');
const links    = document.querySelectorAll('.nav__link');

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    links.forEach(l => l.classList.remove('active'));
    const match = document.querySelector(`.nav__link[href="#${entry.target.id}"]`);
    if (match) match.classList.add('active');
  });
}, { rootMargin: '-40% 0px -50% 0px' });

sections.forEach(s => observer.observe(s));

/* ── Fade-in sections on scroll ───────────────── */
const fadeEls = document.querySelectorAll(
  '.section__title, .about__body, .about__cards, ' +
  '.project-card, .skill-group, .contact__inner'
);

fadeEls.forEach(el => el.classList.add('fade-in'));

const fadeObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

fadeEls.forEach(el => fadeObserver.observe(el));

/* ── Live Market Data (Finnhub) ───────────────────── */
const FINNHUB_KEY = 'd85o28pr01qitd92vcngd85o28pr01qitd92vco0'; // Get a free key at finnhub.io/register

// FX: key = currency code, invert = true means rate is X per USD so we flip it
const FX_PAIRS = [
  { key: 'GBP', label: 'GBP/USD', invert: true },
  { key: 'EUR', label: 'EUR/USD', invert: true },
  { key: 'JPY', label: 'USD/JPY', invert: false },
];

const EQUITIES = [
  { symbol: 'AAPL' },
  { symbol: 'TSLA' },
  { symbol: 'MSFT' },
];

async function fetchForexRates() {
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!res.ok) throw new Error(`Network error (HTTP ${res.status})`);
  const data = await res.json();
  if (data.result !== 'success') throw new Error('Forex data unavailable');
  return data.rates; // { GBP: 0.79, EUR: 0.92, JPY: 149.5, ... }
}

async function finnhubQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Network error (HTTP ${res.status})`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  if (data.c == null || data.c === 0) throw new Error('No data returned');
  return data; // { c: price, d: change, dp: changePct, pc: prevClose }
}

function fmtNum(v, dp = 2) {
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function skeletonCards(labels) {
  return labels.map(label => `
    <li class="ticker-card ticker-card--loading" aria-busy="true">
      <div class="ticker-card__left">
        <span class="ticker-card__symbol">${label}</span>
        <span class="ticker-card__meta">Fetching…</span>
      </div>
      <div class="ticker-card__right">
        <span class="ticker-card__price">———</span>
        <span class="ticker-card__change">———</span>
      </div>
    </li>`).join('');
}

function fxCard(label, rate) {
  const isJPY = label.includes('JPY');
  const dp    = isJPY ? 3 : 5;
  return `
    <li class="ticker-card">
      <div class="ticker-card__left">
        <span class="ticker-card__symbol">${label}</span>
        <span class="ticker-card__meta">Live rate</span>
      </div>
      <div class="ticker-card__right">
        <span class="ticker-card__price">${fmtNum(rate, dp)}</span>
      </div>
    </li>`;
}

function equityCard(symbol, q) {
  const up    = q.d >= 0;
  const dir   = up ? 'up' : 'down';
  const arrow = up ? '▲' : '▼';
  const sign  = up ? '+' : '';
  return `
    <li class="ticker-card ticker-card--${dir}">
      <div class="ticker-card__left">
        <span class="ticker-card__symbol">${symbol}</span>
        <span class="ticker-card__meta">Prev close $${fmtNum(q.pc)}</span>
      </div>
      <div class="ticker-card__right">
        <span class="ticker-card__price">$${fmtNum(q.c)}</span>
        <span class="ticker-card__change">${arrow} ${sign}${fmtNum(q.d)} (${sign}${fmtNum(q.dp)}%)</span>
      </div>
    </li>`;
}

function errorCard(label) {
  return `
    <li class="ticker-card ticker-card--error">
      <div class="ticker-card__left">
        <span class="ticker-card__symbol">${label}</span>
        <span class="ticker-card__meta">Failed to load</span>
      </div>
      <div class="ticker-card__right">
        <span class="ticker-card__change">———</span>
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
  fxList.innerHTML = skeletonCards(FX_PAIRS.map(p => p.label));
  eqList.innerHTML = skeletonCards(EQUITIES.map(e => e.symbol));

  const [fxRatesResult, eqResults] = await Promise.all([
    fetchForexRates().then(r => ({ status: 'fulfilled', value: r })).catch(e => ({ status: 'rejected', reason: e })),
    Promise.allSettled(EQUITIES.map(e => finnhubQuote(e.symbol))),
  ]);

  if (fxRatesResult.status === 'fulfilled') {
    const rates = fxRatesResult.value;
    fxList.innerHTML = FX_PAIRS.map(p => {
      const raw = rates[p.key];
      if (!raw) return errorCard(p.label);
      return fxCard(p.label, p.invert ? 1 / raw : raw);
    }).join('');
  } else {
    const errorBanner = document.getElementById('market-error');
    errorBanner.textContent = `Error: ${fxRatesResult.reason.message}`;
    errorBanner.hidden = false;
    fxList.innerHTML = FX_PAIRS.map(p => errorCard(p.label)).join('');
  }

  function maybeShowBanner(reason) {
    if (!errorBanner.hidden) return;
    errorBanner.textContent = `Error: ${reason.message}`;
    errorBanner.hidden = false;
  }

  eqList.innerHTML = eqResults.map((r, i) => {
    if (r.status === 'fulfilled') return equityCard(EQUITIES[i].symbol, r.value);
    maybeShowBanner(r.reason);
    return errorCard(EQUITIES[i].symbol);
  }).join('');

  if (updatedEl) {
    updatedEl.textContent = `Updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
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

/* ── Crypto (CoinGecko) ───────────────────────────── */
const COIN_COUNT = 10;

async function fetchCryptoMarkets() {
  const url = `https://api.coingecko.com/api/v3/coins/markets` +
              `?vs_currency=usd&order=market_cap_desc&per_page=${COIN_COUNT}&page=1&sparkline=false`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (res.status === 429) throw new Error('Rate limited — try again in a moment');
  if (!res.ok) throw new Error(`CoinGecko error (HTTP ${res.status})`);
  return await res.json();
}

function fmtPrice(v) {
  if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 1)    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function coinSkeletons(count) {
  return Array.from({ length: count }, (_, i) => `
    <li class="coin-card coin-card--loading" aria-busy="true">
      <span class="coin-rank">#${i + 1}</span>
      <div class="coin-logo"></div>
      <div class="coin-info">
        <span class="coin-name">Loading…</span>
        <span class="coin-symbol">———</span>
      </div>
      <span class="coin-price">———</span>
      <span class="coin-change">———</span>
    </li>`).join('');
}

function coinCard(coin) {
  const pct   = coin.price_change_percentage_24h ?? 0;
  const up    = pct >= 0;
  const arrow = up ? '▲' : '▼';
  const sign  = up ? '+' : '';
  const dir   = up ? 'up' : 'dn';
  return `
    <li class="coin-card">
      <span class="coin-rank">#${coin.market_cap_rank}</span>
      <img class="coin-logo" src="${coin.image}" alt="${coin.name}" width="28" height="28" loading="lazy">
      <div class="coin-info">
        <span class="coin-name">${coin.name}</span>
        <span class="coin-symbol">${coin.symbol.toUpperCase()}</span>
      </div>
      <span class="coin-price">${fmtPrice(coin.current_price)}</span>
      <span class="coin-change ${dir}">${arrow} ${sign}${Math.abs(pct).toFixed(2)}%</span>
    </li>`;
}

async function refreshCryptoData() {
  const list      = document.getElementById('coin-list');
  const errorEl   = document.getElementById('crypto-error');
  const updatedEl = document.getElementById('crypto-updated');
  if (!list) return;

  errorEl.hidden = true;
  list.innerHTML = coinSkeletons(COIN_COUNT);

  try {
    const coins    = await fetchCryptoMarkets();
    list.innerHTML = coins.map(coinCard).join('');
    if (updatedEl) {
      updatedEl.textContent = `Updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }
  } catch (err) {
    list.innerHTML      = '';
    errorEl.textContent = `Error: ${err.message}`;
    errorEl.hidden      = false;
  }
}

(function initCrypto() {
  if (!document.getElementById('crypto')) return;

  let countdown     = 120;
  const countdownEl = document.getElementById('crypto-countdown');

  function tick() {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;
    if (countdown <= 0) {
      countdown = 120;
      refreshCryptoData();
    }
  }

  refreshCryptoData();
  setInterval(tick, 1000);
}());

/* ── Countries (REST Countries) ──────────────────── */
let allCountries       = [];
let filteredCountries  = [];
let countriesShown     = 12;
const COUNTRIES_PAGE   = 12;

async function fetchCountries() {
  const fields = 'name,capital,region,population,flags,currencies,languages';
  const res = await fetch(`https://restcountries.com/v3.1/all?fields=${fields}`);
  if (!res.ok) throw new Error(`REST Countries error (HTTP ${res.status})`);
  return await res.json();
}

function fmtPop(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return n.toLocaleString();
}

function getCurrency(currencies) {
  if (!currencies) return '—';
  const first = Object.values(currencies)[0];
  return first ? `${first.name}${first.symbol ? ' (' + first.symbol + ')' : ''}` : '—';
}

function getLanguages(languages) {
  if (!languages) return '—';
  return Object.values(languages).slice(0, 2).join(', ');
}

function countryCard(c) {
  const name     = c.name.common;
  const capital  = c.capital?.[0] || '—';
  const flagSrc  = c.flags?.svg || c.flags?.png || '';
  return `
    <div class="country-card">
      <div class="country-card__flag">
        <img src="${flagSrc}" alt="Flag of ${name}" loading="lazy" width="190" height="120">
      </div>
      <div class="country-card__body">
        <h3 class="country-card__name" title="${name}">${name}</h3>
        <dl class="country-card__info">
          <dt>Capital</dt>    <dd title="${capital}">${capital}</dd>
          <dt>Region</dt>     <dd>${c.region || '—'}</dd>
          <dt>Population</dt> <dd>${fmtPop(c.population)}</dd>
          <dt>Currency</dt>   <dd title="${getCurrency(c.currencies)}">${getCurrency(c.currencies)}</dd>
          <dt>Languages</dt>  <dd title="${getLanguages(c.languages)}">${getLanguages(c.languages)}</dd>
        </dl>
      </div>
    </div>`;
}

function countrySkeletons(n) {
  return Array.from({ length: n }, () => '<div class="country-card country-card--loading"></div>').join('');
}

function renderCountries() {
  const grid     = document.getElementById('country-grid');
  const footer   = document.getElementById('countries-footer');
  const countEl  = document.getElementById('countries-count');
  const moreBtn  = document.getElementById('countries-more');
  if (!grid) return;

  if (filteredCountries.length === 0) {
    grid.innerHTML   = '<p class="countries-empty">No countries found.</p>';
    footer.hidden    = true;
    return;
  }

  const visible   = filteredCountries.slice(0, countriesShown);
  grid.innerHTML  = visible.map(countryCard).join('');

  const remaining = filteredCountries.length - countriesShown;
  countEl.textContent = remaining > 0
    ? `Showing ${countriesShown} of ${filteredCountries.length}`
    : `All ${filteredCountries.length} countries shown`;
  moreBtn.hidden  = remaining <= 0;
  footer.hidden   = false;
}

function applyCountryFilters() {
  const query  = document.getElementById('country-search').value.trim().toLowerCase();
  const region = document.querySelector('.region-btn.active')?.dataset.region || '';

  filteredCountries = allCountries.filter(c => {
    const matchRegion = !region || c.region === region;
    const matchQuery  = !query  ||
      c.name.common.toLowerCase().includes(query) ||
      (c.capital?.[0] || '').toLowerCase().includes(query);
    return matchRegion && matchQuery;
  });

  countriesShown = query ? filteredCountries.length : COUNTRIES_PAGE;
  renderCountries();
}

(function initCountries() {
  if (!document.getElementById('countries')) return;

  document.getElementById('country-search')
    .addEventListener('input', applyCountryFilters);

  document.querySelectorAll('.region-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyCountryFilters();
    });
  });

  document.getElementById('countries-more')
    .addEventListener('click', () => {
      countriesShown += COUNTRIES_PAGE;
      renderCountries();
    });

  const grid    = document.getElementById('country-grid');
  const errorEl = document.getElementById('countries-error');

  grid.innerHTML = countrySkeletons(COUNTRIES_PAGE);

  fetchCountries()
    .then(data => {
      allCountries      = data.sort((a, b) => a.name.common.localeCompare(b.name.common));
      filteredCountries = [...allCountries];
      renderCountries();
    })
    .catch(err => {
      grid.innerHTML      = '';
      errorEl.textContent = `Error: ${err.message}`;
      errorEl.hidden      = false;
    });
}());
