// ═══════════════════════════════════════════
//  main.js — Binaris Auth State Manager
//  Import this as a <script type="module"> in index.html.
//  Handles: auth guard, user UI hydration, sign-out.
// ═══════════════════════════════════════════
import { auth, onAuthStateChanged, signOut } from "./firebase-init.js";

// ── Auth guard ────────────────────────────────────────────────────────────────
// Firebase restores the persisted session asynchronously.
// We act only on the *first* resolution so subsequent token-refreshes
// don't accidentally re-run the guard logic.

let authResolved = false;

// ── Cobinar session bridge ─────────────────────────────────────────────────────
// When a user signs in via Cobinar OAuth, Firebase auth is not active.
// We store the user in localStorage under 'cobinar-user' and hydrate the UI
// from there, bypassing Firebase entirely for Cobinar sessions.
function _loadCobinarSession() {
  try {
    const raw = localStorage.getItem('cobinar-user');
    if (!raw) return null;
    const u = JSON.parse(raw);
    // Treat sessions older than 8 hours as expired
    if (Date.now() - (u.ts || 0) > 8 * 60 * 60 * 1000) {
      localStorage.removeItem('cobinar-user');
      return null;
    }
    return u;
  } catch { return null; }
}

const cobinarUser = _loadCobinarSession();
if (cobinarUser) {
  // Hydrate immediately — no Firebase needed
  authResolved = true;
  const fakeUser = {
    uid:         cobinarUser.uid   || 'cobinar-' + Math.random().toString(36).slice(2),
    displayName: cobinarUser.name  || cobinarUser.email?.split('@')[0] || 'User',
    email:       cobinarUser.email || '',
    photoURL:    cobinarUser.photo || null,
  };
  window._binarisUser = fakeUser;
  // Hydrate once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => _hydrateUserUI(fakeUser));
  } else {
    _hydrateUserUI(fakeUser);
  }
}

const unsubscribe = onAuthStateChanged(auth, (user) => {
  if (authResolved) return;
  authResolved = true;
  unsubscribe();

  if (!user) {
    // Also check for a Cobinar session — already handled above, but guard
    // against edge cases where cobinarUser was set after this fires.
    if (_loadCobinarSession()) return;

    const BOT_UA = /Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|AhrefsBot|SemrushBot|facebookexternalhit|Twitterbot|LinkedInBot|Applebot|ia_archiver/i;
    if (BOT_UA.test(navigator.userAgent)) {
      // Bot detected — do not redirect; let the crawler read the page in place.
      return;
    }
    // Not signed in → send to login page
    window.location.replace("./login.html");
    return;
  }

  // ── User is signed in ──────────────────────────────────────────────────────
  console.log("[Binaris] Authenticated:", user.email);

  // Hydrate every element that shows user data
  _hydrateUserUI(user);

  // Expose user on window so other scripts can access if needed
  window._binarisUser = user;

  // Hide preview bar — signed-in users have no message limit
  if (typeof window._clearPreviewCookie === "function") window._clearPreviewCookie();
  if (typeof window._updatePreviewBar === "function") window._updatePreviewBar();
  const pb = document.getElementById("preview-bar");
  if (pb) pb.style.display = "none";
  // Close paywall if open
  if (typeof window.closePaywall === "function") window.closePaywall();

  // Schedule a notification-permission request after first interaction
  // (browsers block Notification.requestPermission outside user gesture if
  //  called immediately — so we wait for newChat() / the first send)
  _scheduleNotifPermission();
});

// ── Hydrate user UI ───────────────────────────────────────────────────────────
function _hydrateUserUI(user) {
  const displayName = user.displayName || user.email || "You";
  const initials    = _getInitials(displayName);
  const photoURL    = user.photoURL || null;

  // ── All avatar/name/plan elements ─────────────────────────────────────────
  // querySelectorAll covers BOTH the desktop sidebar AND the mobile drawer
  // footer — both use the same CSS classes (.sb-av, .sb-uname, .sb-uplan).
  document.querySelectorAll(".sb-av").forEach((el) => {
    if (photoURL) {
      const img       = document.createElement("img");
      img.src         = photoURL;
      img.alt         = displayName;
      img.style.cssText =
        "width:100%;height:100%;border-radius:50%;object-fit:cover;display:block";
      img.onerror = () => { img.remove(); el.textContent = initials; };
      el.textContent = "";
      el.appendChild(img);
    } else {
      el.textContent = initials;
    }
  });

  document.querySelectorAll(".sb-uname").forEach((el) => { el.textContent = displayName; });
  document.querySelectorAll(".sb-uplan").forEach((el) => { el.textContent = user.email || "Google Account"; });

  // ── Topbar / message avatar (the "U" bubble on outgoing messages) ─────────
  window._binarisUserInitials = initials;
  window._binarisUserPhoto    = photoURL;

  // Patch any already-rendered "U" avatars in the message list
  document.querySelectorAll(".msg.user .m-av").forEach((av) => {
    _applyAvatarToEl(av, photoURL, initials);
  });
}

// ── Avatar helper (used by main + patching) ───────────────────────────────────
function _applyAvatarToEl(el, photoURL, initials) {
  if (!el) return;
  if (photoURL) {
    const img       = document.createElement("img");
    img.src         = photoURL;
    img.alt         = "";
    img.style.cssText =
      "width:100%;height:100%;border-radius:50%;object-fit:cover;display:block";
    img.onerror = () => { img.remove(); el.textContent = initials; };
    el.textContent = "";
    el.appendChild(img);
  } else {
    el.textContent = initials;
  }
}

// Expose helper so index.html's addMsg() can call it for new messages
window._applyUserAvatar = function (el) {
  _applyAvatarToEl(el, window._binarisUserPhoto, window._binarisUserInitials || "U");
};

// ── Initials helper ───────────────────────────────────────────────────────────
function _getInitials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Sign-out ──────────────────────────────────────────────────────────────────
window.logout = async function () {
  // Clear Cobinar session if present
  localStorage.removeItem('cobinar-user');
  sessionStorage.removeItem('cobinar-user-email');
  sessionStorage.removeItem('cobinar-user-name');
  sessionStorage.removeItem('cobinar-user-photo');
  sessionStorage.removeItem('cobinar-user-uid');
  try {
    await signOut();
  } catch (_e) { /* Firebase may not have a session */ }
  window.location.replace('./login.html');
};

// ── Notification permission scheduling ───────────────────────────────────────
function _scheduleNotifPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "default") return;

  const _req = () => {
    document.removeEventListener("click",   _req);
    document.removeEventListener("keydown", _req);
    if (typeof requestNotifPermission === "function") {
      requestNotifPermission();
    }
  };
  document.addEventListener("click",   _req, { once: true });
  document.addEventListener("keydown", _req, { once: true });
}
