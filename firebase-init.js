// ═══════════════════════════════════════════
//  firebase-init.js — Binaris Firebase Module
//  Single source of truth for auth + Firestore
// ═══════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut as _signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAm4PyWfIUI0mnXn8uNE2L0cqwdV4PK5yE",
  authDomain:        "cobinar-prod.firebaseapp.com",
  projectId:         "cobinar-prod",
  storageBucket:     "cobinar-prod.firebasestorage.app",
  messagingSenderId: "1024793965812",
  appId:             "1:1024793965812:web:2806c2a9cec7c7c1165aa1",
  measurementId:     "G-9GY9ZXXW65",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// ── IAB detection ──────────────────────────────────────────────────────────────
// In-app browsers (Instagram, Facebook, TikTok, etc.) block window.open() popups.
// We detect them and fall back to a full-page redirect flow instead, which works
// universally. This also eliminates the atob() errors caused by Firebase's popup
// fallback mechanism storing corrupt pending-state in localStorage.
function _isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return (
    /FBAN|FBAV|Instagram|Twitter\/|Snapchat|TikTok|Line\/|KAKAOTALK|MicroMessenger|LinkedInApp|Pinterest\//.test(ua) ||
    (ua.includes("wv") && !ua.includes("Chrome/") && /Android/.test(ua))
  );
}

// ── Exports ───────────────────────────────────────────────────────────────────
export { app, auth, db, onAuthStateChanged };

/**
 * Google sign-in.
 *  - Desktop / standard browsers → popup (instant, no page reload)
 *  - In-app browsers (IAB)       → full-page redirect (universally supported)
 *
 * After a redirect the page reloads; call handleGoogleRedirectResult() on load
 * to complete sign-in and capture the user object.
 */
export async function signInWithGoogle() {
  if (_isInAppBrowser()) {
    // Redirect flow: navigates away and returns — result handled on next load
    await signInWithRedirect(auth, provider);
    return null;
  }
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/**
 * Call once on every page load (before any auth gate).
 * Returns the signed-in User if we just came back from a Google redirect,
 * or null if this is a normal load.
 */
export async function handleGoogleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    return result ? result.user : null;
  } catch (err) {
    // Surface auth errors (e.g. account-exists-with-different-credential)
    throw err;
  }
}

/** Email + password — sign in existing user */
export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/** Email + password — create new account, optionally set display name */
export async function signUpWithEmail(email, password, displayName) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(result.user, { displayName });
  }
  return result.user;
}

/** Send password-reset email */
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

/** Sign out */
export async function signOut() {
  await _signOut(auth);
}
