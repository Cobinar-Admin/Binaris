// ═══════════════════════════════════════════
//  firebase-init.js — Binaris Firebase Module
//  Single source of truth for auth + Firestore
// ═══════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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
// Always show account chooser — never silently reuse a session
provider.setCustomParameters({ prompt: "select_account" });

// ── Exports ──────────────────────────────────────────────────────────────────

export { app, auth, db, onAuthStateChanged };

/**
 * Open Google sign-in popup and return the Firebase User on success.
 * Throws on cancellation or error so callers can surface UI feedback.
 */
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/**
 * Sign the current user out and clear the local session.
 */
export async function signOut() {
  await _signOut(auth);
}
