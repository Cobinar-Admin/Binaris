// ═══════════════════════════════════════════
//  firebase-init.js — Binaris Firebase Module
// ═══════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
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

// ── Exports ───────────────────────────────────────────────────────────────────
export { app, auth, db, onAuthStateChanged };

/**
 * Sign in with a Google ID token obtained from GIS One Tap.
 * Called by login.html's GIS callback — never navigates away.
 */
export async function signInWithGoogleCredential(idToken) {
  const credential = GoogleAuthProvider.credential(idToken);
  const result     = await signInWithCredential(auth, credential);
  return result.user;
}

/** Email + password — sign in existing user */
export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/** Email + password — create new account, optionally set display name */
export async function signUpWithEmail(email, password, displayName) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(result.user, { displayName });
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
