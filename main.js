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

const unsubscribe = onAuthStateChanged(auth, (user) => {
  if (authResolved) return;
  authResolved = true;
  unsubscribe(); // One-shot guard — stop listening after first resolution

  if (!user) {
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
  try {
    await signOut();
    window.location.replace("./login.html");
  } catch (err) {
    console.error("[Binaris] Sign-out failed:", err);
  }
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
