// ╔══════════════════════════════════════════════════════════════════╗
// ║  ads.js — Binaris Ad System                                      ║
// ║  Version: 1.0.0                                                  ║
// ║  Handles Google AdSense banner ads in a non-intrusive way.       ║
// ║                                                                  ║
// ║  QUICK SETUP:                                                    ║
// ║    1. Set MODE to "prod" when going live                         ║
// ║    2. Replace REAL_PUB_ID and REAL_AD_SLOT with your values      ║
// ║    3. Call initAds() once on page load                           ║
// ║    4. Call handleAIResponseEnd() when AI finishes responding     ║
// ║    5. Call handleUserMessage() when user sends a message         ║
// ╚══════════════════════════════════════════════════════════════════╝

// ─────────────────────────────────────────────────────────────────────
//  ⚙️  CONFIGURATION — edit this section only
// ─────────────────────────────────────────────────────────────────────

/**
 * "dev"  → Uses Google's official test ad unit (safe for development).
 * "prod" → Uses your real ad unit (only enable for production).
 *
 * TIP: Set to "dev" on localhost automatically via the auto-detect below.
 */
const MODE = "dev"; // ← change to "prod" when deploying

/**
 * Your real AdSense publisher + slot IDs.
 * Publisher ID is the part after "ca-pub-" in your AdSense account.
 * Slot ID is the number after the slash in your Ad Unit ID.
 *
 * Your Ad Unit ID: ca-app-pub-3850410266185876/1390019191
 *                   └─── pub ──────────────────┘└─ slot ─┘
 */
const REAL_PUB_ID  = "ca-pub-3850410266185876";    // ← your publisher ID
const REAL_AD_SLOT = "";                 // ← your ad slot

/**
 * Google's official test ad unit — do NOT change this.
 * Safe to use during development; never charges real money.
 * Test Ad Unit: ca-app-pub-3940256099942544/6300978111
 */
const TEST_PUB_ID  = "ca-pub-3940256099942544";    // Google's test publisher
const TEST_AD_SLOT = "6300978111";                 // Google's test slot

/**
 * Minimum milliseconds between ad displays.
 * Prevents rapid reloads and respects AdSense policies.
 */
const AD_COOLDOWN = 15000; // 15 seconds

/**
 * How long to wait after AI finishes before showing the ad.
 * A small delay feels less abrupt.
 */
const AD_SHOW_DELAY = 800; // 0.8 seconds

/**
 * Duration of the fade-out animation before display:none is applied.
 */
const AD_HIDE_DURATION = 380; // ms — must match CSS transition

// ─────────────────────────────────────────────────────────────────────
//  🔧  INTERNAL STATE — do not edit
// ─────────────────────────────────────────────────────────────────────

let _initialized     = false;  // AdSense script loaded
let _adLoaded        = false;  // adsbygoogle.push() called once
let _lastShownAt     = 0;      // timestamp of last showAd() call
let _showTimer       = null;   // pending setTimeout for showAd
let _container       = null;   // #ad-container DOM element
let _insEl           = null;   // <ins class="adsbygoogle"> element

// Auto-detect localhost → force dev mode
const _isLocalhost = (
  location.hostname === "localhost"        ||
  location.hostname === "127.0.0.1"       ||
  location.hostname === ""                ||
  location.hostname.endsWith(".local")    ||
  location.hostname.startsWith("192.168.")
);

const _mode = _isLocalhost ? "dev" : MODE;
const _pubId   = _mode === "dev" ? TEST_PUB_ID  : REAL_PUB_ID;
const _adSlot  = _mode === "dev" ? TEST_AD_SLOT : REAL_AD_SLOT;

// ─────────────────────────────────────────────────────────────────────
//  🏗️  DOM INJECTION — build the ad container from scratch
// ─────────────────────────────────────────────────────────────────────

/**
 * Injects the ad container HTML into <body>.
 * Called once by initAds().
 * You do NOT need to add any HTML manually.
 */
function _injectDOM() {
  if (document.getElementById("ad-container")) return; // already injected

  // Outer wrapper — positions the ad above the dock
  _container = document.createElement("div");
  _container.id = "ad-container";
  _container.setAttribute("aria-hidden", "true"); // decorative / non-interactive

  // Inner box — glassmorphism card
  const box = document.createElement("div");
  box.className = "ad-box";

  // Top row: label + close button
  const header = document.createElement("div");
  header.className = "ad-header";

  const label = document.createElement("span");
  label.className = "ad-label";
  label.textContent = "Sponsored";

  const closeBtn = document.createElement("button");
  closeBtn.className = "ad-close";
  closeBtn.setAttribute("aria-label", "Close ad");
  closeBtn.innerHTML = `<svg width="9" height="9" viewBox="0 0 9 9" fill="none">
    <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    hideAd();
    // After user closes, extend cooldown so it won't re-appear too soon
    _lastShownAt = Date.now() + AD_COOLDOWN;
  });

  header.appendChild(label);
  header.appendChild(closeBtn);

  // The actual AdSense <ins> element
  _insEl = document.createElement("ins");
  _insEl.className = "adsbygoogle";
  _insEl.style.display = "block";
  _insEl.setAttribute("data-ad-client", _pubId);
  _insEl.setAttribute("data-ad-slot",   _adSlot);
  _insEl.setAttribute("data-ad-format", "auto");
  _insEl.setAttribute("data-full-width-responsive", "true");

  box.appendChild(header);
  box.appendChild(_insEl);
  _container.appendChild(box);
  document.body.appendChild(_container);
}

// ─────────────────────────────────────────────────────────────────────
//  🎨  CSS INJECTION — styles scoped to ad-container
// ─────────────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById("binaris-ad-styles")) return;

  const style = document.createElement("style");
  style.id = "binaris-ad-styles";
  style.textContent = `
    /* ═══════════════════════════════════════════
       BINARIS AD SYSTEM — scoped styles
       All variables inherit from index.html :root
    ═══════════════════════════════════════════ */

    #ad-container {
      /* Positioning: fixed, centered above the dock input area.
         left offset accounts for the sidebar on desktop.
         On tablet/mobile the sidebar collapses so left becomes 0.       */
      position: fixed;
      left: var(--sb-w, 232px);   /* matches sidebar width */
      right: 0;
      bottom: calc(var(--dock-base, 18px) + var(--safe-bottom, 0px) + 88px);
      z-index: 21;                /* above dock (z:20), below mob-nav (z:40) */
      pointer-events: none;       /* container transparent to clicks */

      display: flex;
      justify-content: center;
      align-items: flex-end;
      padding: 0 18px;

      /* Hidden by default */
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.4s cubic-bezier(.16,1,.3,1),
                  transform 0.4s cubic-bezier(.16,1,.3,1);
    }

    #ad-container.ad-visible {
      opacity: 1;
      transform: translateY(0);
    }

    /* ── Ad card ──────────────────────────── */
    .ad-box {
      pointer-events: all;
      width: 100%;
      max-width: 700px;             /* matches .dock-inner max-width */

      /* Glassmorphism — matches the app's .bar card aesthetic */
      background: rgba(8, 8, 8, 0.82);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 16px;
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.55),
        0 0 0 1px rgba(255, 255, 255, 0.03) inset;

      overflow: hidden;
      padding: 8px 12px 10px;
    }

    /* ── Header row ───────────────────────── */
    .ad-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .ad-label {
      font-family: "Geist Mono", "JetBrains Mono", monospace;
      font-size: 0.58rem;
      font-weight: 500;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.25);
      user-select: none;
    }

    .ad-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 5px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: transparent;
      color: rgba(255, 255, 255, 0.28);
      cursor: pointer;
      padding: 0;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
      flex-shrink: 0;
    }
    .ad-close:hover {
      background: rgba(255, 255, 255, 0.07);
      color: rgba(255, 255, 255, 0.72);
      border-color: rgba(255, 255, 255, 0.15);
    }

    /* ── AdSense <ins> ────────────────────── */
    .adsbygoogle {
      display: block;
      min-width: 280px;
      width: 100%;
      /* Height adapts to responsive format */
    }

    /* ── Responsive breakpoints ───────────── */

    /* Tablet + narrower (sidebar collapses) */
    @media (max-width: 1023px) {
      #ad-container {
        left: 0;   /* no sidebar */
      }
    }

    /* Mobile — account for mob-nav bar at bottom (54px) */
    @media (max-width: 640px) {
      #ad-container {
        left: 0;
        bottom: calc(
          var(--mob-nav-h, 54px)
          + var(--safe-bottom, 0px)
          + 14px
        );
        padding: 0 12px;
      }

      .ad-box {
        border-radius: 14px;
        padding: 7px 10px 8px;
      }
    }

    /* Themes: light / sepia — invert the glassmorphism tint */
    [data-theme="light"] .ad-box,
    [data-theme="sepia"] .ad-box {
      background: rgba(245, 245, 240, 0.88);
      border-color: rgba(0, 0, 0, 0.08);
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.12),
        0 0 0 1px rgba(0, 0, 0, 0.02) inset;
    }
    [data-theme="light"] .ad-label,
    [data-theme="sepia"] .ad-label {
      color: rgba(0, 0, 0, 0.28);
    }
    [data-theme="light"] .ad-close,
    [data-theme="sepia"] .ad-close {
      color: rgba(0, 0, 0, 0.35);
      border-color: rgba(0, 0, 0, 0.10);
    }
    [data-theme="light"] .ad-close:hover,
    [data-theme="sepia"] .ad-close:hover {
      background: rgba(0, 0, 0, 0.05);
      color: rgba(0, 0, 0, 0.72);
      border-color: rgba(0, 0, 0, 0.18);
    }
  `;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────
//  📡  ADSENSE SCRIPT LOADER
// ─────────────────────────────────────────────────────────────────────

function _loadAdSenseScript() {
  return new Promise((resolve, reject) => {
    // Avoid injecting the script twice
    if (document.querySelector('script[data-ad-client]')) {
      resolve(); return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-ad-client", _pubId);
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${_pubId}`;

    script.onload  = () => resolve();
    script.onerror = () => {
      // Non-fatal — ad blockers will trigger this; app still works fine
      console.warn("[Binaris Ads] AdSense script blocked or unavailable.");
      resolve(); // resolve (not reject) so initAds() doesn't throw
    };

    document.head.appendChild(script);
  });
}

// ─────────────────────────────────────────────────────────────────────
//  📌  PUBLIC API
// ─────────────────────────────────────────────────────────────────────

/**
 * initAds()
 * ─────────
 * Call ONCE after the page loads (or after user signs in).
 * Injects the AdSense script, CSS, and DOM container.
 *
 * Usage:
 *   import { initAds } from "./ads.js";
 *   initAds();
 */
export async function initAds() {
  if (_initialized) return;

  if (_mode === "dev") {
    console.log(
      "%c[Binaris Ads] Test Mode Active 🧪",
      "color:#32d583;font-weight:600;font-family:monospace",
      "\n  Publisher:", _pubId,
      "\n  Slot:", _adSlot,
      "\n  Cooldown:", AD_COOLDOWN + "ms",
    );
  }

  _injectStyles();
  _injectDOM();
  await _loadAdSenseScript();

  _initialized = true;
}

/**
 * showAd()
 * ────────
 * Fades in the ad banner above the input dock.
 * Respects the cooldown — silently skips if called too soon.
 * Loads the ad only once via adsbygoogle.push({}).
 */
export function showAd() {
  if (!_initialized || !_container) return;

  const now = Date.now();
  if (now - _lastShownAt < AD_COOLDOWN) {
    if (_mode === "dev") {
      const remaining = Math.ceil((AD_COOLDOWN - (now - _lastShownAt)) / 1000);
      console.log(`[Binaris Ads] Cooldown active — ${remaining}s remaining`);
    }
    return;
  }

  // Load ad content exactly once (AdSense policy requires single push per slot)
  if (!_adLoaded) {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      _adLoaded = true;
      if (_mode === "dev") console.log("[Binaris Ads] Ad unit pushed to AdSense");
    } catch (e) {
      console.warn("[Binaris Ads] adsbygoogle.push failed:", e.message);
    }
  }

  // Make visible
  _container.style.display = "flex";
  // Force reflow so the transition actually plays from opacity:0
  void _container.offsetWidth;
  _container.classList.add("ad-visible");

  _lastShownAt = now;
  if (_mode === "dev") console.log("[Binaris Ads] Ad shown at", new Date().toLocaleTimeString());
}

/**
 * hideAd()
 * ────────
 * Fades out and removes the ad from view.
 * Safe to call when no ad is currently shown.
 */
export function hideAd() {
  if (!_container) return;

  _container.classList.remove("ad-visible");

  // After transition completes, fully remove from layout
  clearTimeout(_container._hideTimer);
  _container._hideTimer = setTimeout(() => {
    _container.style.display = "none";
  }, AD_HIDE_DURATION);
}

/**
 * handleAIResponseEnd()
 * ─────────────────────
 * Call this when the AI finishes generating a response.
 * Shows the ad after a short delay (feels less abrupt).
 *
 * Usage in index.html after the streaming loop ends:
 *   handleAIResponseEnd();
 */
export function handleAIResponseEnd() {
  clearTimeout(_showTimer);
  _showTimer = setTimeout(() => {
    showAd();
  }, AD_SHOW_DELAY);
}

/**
 * handleUserMessage()
 * ───────────────────
 * Call this when the user sends a new message.
 * Hides the ad immediately so it doesn't block reading.
 *
 * Usage in index.html inside send():
 *   handleUserMessage();
 */
export function handleUserMessage() {
  clearTimeout(_showTimer); // cancel any pending show
  hideAd();
}
