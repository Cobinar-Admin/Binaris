// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ads.js — Binaris Ad System v2.1                                         ║
// ║                                                                          ║
// ║  ⚠️  IMPORTANT — READ BEFORE SETUP                                       ║
// ║  ─────────────────────────────────────────────────────────────────────  ║
// ║  This file uses Google AdSense for Web (pagead2.googlesyndication.com). ║
// ║                                                                          ║
// ║  Your publisher ID MUST use the "ca-pub-" format.                        ║
// ║                                                                          ║
// ║  If your current ID looks like  ca-app-pub-XXXXXXXXXXXXXXXX             ║
// ║  ─ that is an AdMob ID, built for native Android/iOS apps only.          ║
// ║  ─ It will NOT work in a browser. AdMob will log zero requests.          ║
// ║                                                                          ║
// ║  For a PWA / web app you need a separate AdSense account:                ║
// ║  Sign up at https://adsense.google.com to get your ca-pub-… ID.         ║
// ║                                                                          ║
// ║  QUICK SETUP                                                             ║
// ║  1. Replace REAL_PUB_ID  with your  ca-pub-XXXXXXXXXXXXXXXX             ║
// ║  2. Replace REAL_AD_SLOT with your ad unit slot number                   ║
// ║  3. Set MODE = "prod" before deploying                                   ║
// ║  4. initAds() is already wired in index.html — nothing else needed       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ─────────────────────────────────────────────────────────────────────────────
//  ⚙️  CONFIGURATION — only edit this section
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "dev"  → Google's official test ads. Safe for development.
 * "prod" → Your live AdSense unit.
 * Localhost is always forced to "dev" regardless of this setting.
 */
const MODE = "dev"; // ← change to "prod" when deploying

/**
 * Your real AdSense credentials.
 *
 * Publisher ID format:  ca-pub-XXXXXXXXXXXXXXXX
 *   (NOT  ca-app-pub-… — that is AdMob, not AdSense)
 */
const REAL_PUB_ID  = "ca-pub-3850410266185876"; // ← your AdSense publisher ID
const REAL_AD_SLOT = "3749318170";              // ← your ad unit slot

/**
 * Google's official AdSense test credentials.
 * Shows realistic test ads; never records real impressions.
 * Do NOT change these.
 */
const TEST_PUB_ID  = "ca-pub-3940256099942544";
const TEST_AD_SLOT = "6300978111";

/** Minimum ms between ad shows. */
const AD_COOLDOWN      = 15000; // 15 s

/** Delay after AI finishes before the banner appears. */
const AD_SHOW_DELAY    = 900;   // ms

/** Must match the CSS hide transition below. */
const AD_HIDE_DURATION = 400;   // ms

// ─────────────────────────────────────────────────────────────────────────────
//  🔧  INTERNAL STATE
// ─────────────────────────────────────────────────────────────────────────────

let _initialized = false;
let _adPushed    = false;
let _lastShownAt = 0;
let _showTimer   = null;
let _container   = null;
let _insEl       = null;

// Auto-detect dev environment → always force safe test mode
const _isLocalhost = (
  location.hostname === "localhost"        ||
  location.hostname === "127.0.0.1"       ||
  location.hostname === ""                ||
  location.hostname.endsWith(".local")    ||
  location.hostname.startsWith("192.168.")
);

const _mode  = _isLocalhost ? "dev" : MODE;
const _pubId = _mode === "dev" ? TEST_PUB_ID  : REAL_PUB_ID;
const _slot  = _mode === "dev" ? TEST_AD_SLOT : REAL_AD_SLOT;

// ─────────────────────────────────────────────────────────────────────────────
//  🎨  CSS INJECTION
//
//  ⚡ ROOT FIX: The container is NEVER set to display:none.
//     AdSense measures and fills the <ins> slot using the browser's
//     layout engine. If the container is display:none, the slot has
//     zero dimensions and AdSense skips it — resulting in NO request.
//
//     All show/hide is done via opacity + transform only.
//     The container is position:fixed so it has no layout impact.
// ─────────────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById("binaris-ad-styles")) return;

  const style = document.createElement("style");
  style.id = "binaris-ad-styles";
  style.textContent = `

  /* ═════════════════════════════════════════════════
     CONTAINER — fixed, always in DOM, never display:none
  ═════════════════════════════════════════════════ */

  #ad-container {
    position: fixed;
    z-index: 21;       /* above dock (20), below mob-nav (40) */

    display: flex;
    justify-content: center;
    align-items: flex-end;

    /* Hidden by default — opacity/transform ONLY, never display:none */
    opacity: 0;
    transform: translateY(18px);
    pointer-events: none;

    transition:
      opacity   0.40s cubic-bezier(.16, 1, .3, 1),
      transform 0.40s cubic-bezier(.16, 1, .3, 1);
    will-change: opacity, transform;

    /* ── Mobile (≤640px) ──────────────────────────────
       mob-nav:  54px + safe-bottom  (z:40)
       dock:     bottom = mob-nav + safe, padding-bottom = 14px
       bar:      ~68px
       → dock-top ≈ mob-nav + safe + 82px
       Ad sits comfortably above with 10px breathing room.  */
    left: 0;
    right: 0;
    bottom: calc(var(--mob-nav-h, 54px) + var(--safe-bottom, 0px) + 92px);
    padding: 0 14px;
  }

  /* ── Tablet (641 – 1023px) ────────────────────────
     mob-nav hidden; dock: left=0, padding-bottom=dock-base+safe
     bar + hint ≈ 90px  →  dock total ≈ 18 + safe + 90px      */
  @media (min-width: 641px) {
    #ad-container {
      left: 0;
      bottom: calc(var(--dock-base, 18px) + var(--safe-bottom, 0px) + 92px);
      padding: 0 22px;
    }
  }

  /* ── Desktop (≥1024px) ────────────────────────────
     Sidebar: left = var(--sb-w, 232px)                        */
  @media (min-width: 1024px) {
    #ad-container {
      left: var(--sb-w, 232px);
      bottom: calc(var(--dock-base, 18px) + var(--safe-bottom, 0px) + 94px);
      padding: 0 26px;
    }
  }

  /* Wide desktop: sidebar grows to 256px */
  @media (min-width: 1280px) {
    #ad-container { left: 256px; }
  }

  /* Shown state */
  #ad-container.ad-visible {
    opacity: 1;
    transform: translateY(0);
  }


  /* ═════════════════════════════════════════════════
     AD CARD
  ═════════════════════════════════════════════════ */

  .ad-box {
    pointer-events: all;
    width: 100%;

    /* Mobile → 320px standard banner */
    max-width: 340px;

    background: rgba(9, 9, 9, 0.88);
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);

    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;

    box-shadow:
      0  2px  8px rgba(0, 0, 0, 0.35),
      0 14px 44px rgba(0, 0, 0, 0.60),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);

    overflow: hidden;
    padding: 6px 10px 9px;
  }

  /* Tablet → 468px medium rectangle */
  @media (min-width: 641px) {
    .ad-box {
      max-width: 468px;
      border-radius: 17px;
      padding: 7px 13px 10px;
    }
  }

  /* Desktop → 728px leaderboard */
  @media (min-width: 1024px) {
    .ad-box {
      max-width: 728px;
      border-radius: 18px;
      padding: 7px 14px 10px;
    }
  }


  /* ── Header ───────────────────────────────────── */

  .ad-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
  }

  .ad-label {
    font-family: "Geist Mono", "JetBrains Mono", monospace;
    font-size: 0.53rem;
    font-weight: 600;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.20);
    user-select: none;
    flex-shrink: 0;
  }

  .ad-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: transparent;
    color: rgba(255, 255, 255, 0.24);
    cursor: pointer;
    padding: 0;
    transition: background 0.14s, color 0.14s, border-color 0.14s;
  }

  .ad-close:hover {
    background:   rgba(255, 255, 255, 0.07);
    color:        rgba(255, 255, 255, 0.78);
    border-color: rgba(255, 255, 255, 0.15);
  }


  /* ── AdSense <ins> ────────────────────────────── */

  .adsbygoogle {
    display: block !important;
    width: 100% !important;
    min-width: 250px;
    /* Height set by AdSense responsive format */
  }


  /* ═════════════════════════════════════════════════
     LIGHT THEMES  (light, sepia)
  ═════════════════════════════════════════════════ */

  [data-theme="light"] .ad-box,
  [data-theme="sepia"]  .ad-box {
    background: rgba(246, 244, 240, 0.94);
    border-color: rgba(0, 0, 0, 0.07);
    box-shadow:
      0  2px  8px rgba(0, 0, 0, 0.08),
      0 10px 32px rgba(0, 0, 0, 0.14),
      inset 0 -1px 0 rgba(0, 0, 0, 0.03);
  }

  [data-theme="light"] .ad-label,
  [data-theme="sepia"]  .ad-label { color: rgba(0, 0, 0, 0.20); }

  [data-theme="light"] .ad-close,
  [data-theme="sepia"]  .ad-close {
    color:        rgba(0, 0, 0, 0.26);
    border-color: rgba(0, 0, 0, 0.08);
  }

  [data-theme="light"] .ad-close:hover,
  [data-theme="sepia"]  .ad-close:hover {
    background:   rgba(0, 0, 0, 0.05);
    color:        rgba(0, 0, 0, 0.78);
    border-color: rgba(0, 0, 0, 0.16);
  }


  /* ═════════════════════════════════════════════════
     TINTED DARK THEMES — inherit each theme's surface tone
  ═════════════════════════════════════════════════ */

  [data-theme="midnight"] .ad-box { background: rgba( 7, 10, 18, 0.90); }
  [data-theme="forest"]   .ad-box { background: rgba( 6, 11,  6, 0.90); }
  [data-theme="ocean"]    .ad-box { background: rgba( 3,  8, 14, 0.90); }
  [data-theme="violet"]   .ad-box { background: rgba( 8,  6, 13, 0.90); }
  [data-theme="slate"]    .ad-box { background: rgba(10, 13, 20, 0.90); }

  `;
  document.head.appendChild(style);
}


// ─────────────────────────────────────────────────────────────────────────────
//  🏗️  DOM INJECTION
// ─────────────────────────────────────────────────────────────────────────────

function _injectDOM() {
  const existing = document.getElementById("ad-container");
  if (existing) { _container = existing; return; }

  _container = document.createElement("div");
  _container.id = "ad-container";
  _container.setAttribute("aria-hidden", "true");
  _container.setAttribute("role", "complementary");
  _container.setAttribute("aria-label", "Advertisement");

  const box    = document.createElement("div");
  box.className = "ad-box";

  const header = document.createElement("div");
  header.className = "ad-header";

  const label  = document.createElement("span");
  label.className = "ad-label";
  label.textContent = "Ad";

  const closeBtn = document.createElement("button");
  closeBtn.className = "ad-close";
  closeBtn.setAttribute("aria-label", "Close ad");
  closeBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
    <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
  </svg>`;
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    hideAd();
    // User dismissed — extend cooldown so it won't reappear right away
    _lastShownAt = Date.now() + AD_COOLDOWN;
  });

  header.appendChild(label);
  header.appendChild(closeBtn);

  _insEl = document.createElement("ins");
  _insEl.className     = "adsbygoogle";
  _insEl.style.display = "block";
  _insEl.setAttribute("data-ad-client",             _pubId);
  _insEl.setAttribute("data-ad-slot",               _slot);
  _insEl.setAttribute("data-ad-format",             "auto");
  _insEl.setAttribute("data-full-width-responsive", "true");

  // Dev mode: suppress real impression recording
  if (_mode === "dev") {
    _insEl.setAttribute("data-adtest", "on");
  }

  box.appendChild(header);
  box.appendChild(_insEl);
  _container.appendChild(box);
  document.body.appendChild(_container);
}


// ─────────────────────────────────────────────────────────────────────────────
//  📡  ADSENSE SCRIPT LOADER
// ─────────────────────────────────────────────────────────────────────────────

function _loadAdSenseScript() {
  return new Promise((resolve) => {
    if (document.querySelector('script[src*="adsbygoogle"]')) {
      resolve(); return;
    }

    const script       = document.createElement("script");
    script.async       = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-ad-client", _pubId);
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${_pubId}`;

    script.onload  = () => resolve();
    script.onerror = () => {
      console.warn("[Binaris Ads] AdSense script blocked or unavailable (ad blocker?).");
      resolve(); // non-fatal — app continues normally
    };

    document.head.appendChild(script);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
//  ⚡  PUSH THE AD SLOT (internal, called once in initAds)
//
//  Why push here rather than in showAd()?
//  ────────────────────────────────────────────────────────────────────────
//  AdSense requires the <ins> element to be in the browser's render tree
//  (not display:none) when push() is called. Our container is always
//  position:fixed / opacity:0 — never display:none — so it's always
//  "rendered" from the browser's perspective.
//
//  Pushing early means the ad network has time to run its auction and
//  fill the slot in the background. By the time the user reads the AI
//  response and showAd() fires (≥ 0.9s later), the creative is ready
//  and appears instantly — no flicker, no empty banner.
// ─────────────────────────────────────────────────────────────────────────────

function _pushAd() {
  if (_adPushed) return;
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    _adPushed = true;
    if (_mode === "dev") console.log("[Binaris Ads] adsbygoogle.push() → slot loading in background");
  } catch (err) {
    console.warn("[Binaris Ads] push() failed:", err.message);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  📌  PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * initAds()
 * ─────────
 * Call once on page load. Injects CSS, DOM, AdSense script, and pre-loads
 * the ad slot so it's filled before the first showAd() call.
 *
 * Already wired from the <script type="module"> block in index.html.
 */
export async function initAds() {
  if (_initialized) return;

  if (_mode === "dev") {
    console.log(
      "%c[Binaris Ads] 🧪 Test Mode",
      "color:#32d583;font-weight:700;font-family:monospace;font-size:12px",
      `\n  Publisher  : ${_pubId}`,
      `\n  Slot       : ${_slot}`,
      `\n  data-adtest: on  (no real impressions)`,
      `\n  Cooldown   : ${AD_COOLDOWN / 1000}s`,
      "\n\n  ⚠️  Zero requests in AdMob? That's expected — see the note at",
      "\n      the top of ads.js. AdMob is for native apps; AdSense is for web.",
    );
  }

  _injectStyles();
  _injectDOM();
  await _loadAdSenseScript();
  _pushAd(); // ← pre-load ad in background while user reads the response

  _initialized = true;
}

/**
 * showAd()
 * ────────
 * Fades the banner in. Skips silently if cooldown is active.
 * Because the slot was pushed during initAds(), the creative is
 * already filled — no extra latency.
 */
export function showAd() {
  if (!_initialized || !_container) return;

  const now = Date.now();
  if (now - _lastShownAt < AD_COOLDOWN) {
    if (_mode === "dev") {
      const rem = Math.ceil((AD_COOLDOWN - (now - _lastShownAt)) / 1000);
      console.log(`[Binaris Ads] Cooldown: ${rem}s remaining`);
    }
    return;
  }

  _container.classList.add("ad-visible");
  _lastShownAt = now;

  if (_mode === "dev") console.log("[Binaris Ads] ✓ Banner shown at", new Date().toLocaleTimeString());
}

/**
 * hideAd()
 * ────────
 * Fades the banner out. Does NOT use display:none — the <ins> stays
 * in the render tree so AdSense always has a valid slot to measure.
 */
export function hideAd() {
  if (!_container) return;
  _container.classList.remove("ad-visible");
  // Note: no display:none here — opacity:0 is the hidden state
}

/**
 * handleAIResponseEnd()
 * ─────────────────────
 * Called when the AI finishes responding. Shows the banner after a
 * short delay so it doesn't feel abrupt.
 * Already wired in index.html's send() function.
 */
export function handleAIResponseEnd() {
  clearTimeout(_showTimer);
  _showTimer = setTimeout(showAd, AD_SHOW_DELAY);
}

/**
 * handleUserMessage()
 * ───────────────────
 * Called when the user sends a new message. Hides the banner immediately
 * so it doesn't block the chat.
 * Already wired in index.html's send() function.
 */
export function handleUserMessage() {
  clearTimeout(_showTimer);
  hideAd();
}
