// ═══════════════════════════════════════════
//  chat.js — Binaris Firestore Chat Manager
//  Fixes:
//   · Import from firebase-init.js (not main.js)
//   · CDN URLs for Firestore (not bare "firebase/firestore")
//   · Firestore instance now exported from firebase-init.js
//  Adds:
//   · Auth listener → loads chats on sign-in
//   · window.binarisChat → exposes API to inline index.html scripts
//   · Hydrates ALL user blocks (desktop sidebar + mobile drawer)
// ═══════════════════════════════════════════
import { auth, db, onAuthStateChanged } from "./firebase-init.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ── Auth listener — triggers on every sign-in ────────────────────────────────
// One-shot: we only need to react to the first resolved auth state.
// Subsequent token refreshes must not re-run the setup logic.
let _chatReady = false;

onAuthStateChanged(auth, async (user) => {
  if (_chatReady) return;
  _chatReady = true;

  if (!user) return; // Signed out — index.html auth guard handles redirect

  // 1. Hydrate every avatar / name / email element (desktop + mobile drawer)
  _hydrateUserBlocks(user);

  // 2. Fetch this user's chats from Firestore and inject into sidebar
  try {
    const chats = await loadUserChats();
    // Pass to index.html's injectFirestoreChats() if it's ready;
    // if not yet defined (race), the function is queued via the event below.
    if (typeof window.injectFirestoreChats === "function") {
      window.injectFirestoreChats(chats);
    } else {
      // index.html inline script may not have run yet — queue for when it does
      window._binarisQueuedChats = chats;
    }
  } catch (err) {
    console.error("[Binaris Chat] Failed to load chats from Firestore:", err);
  }
});

// ── Public API (exposed on window so index.html inline scripts can call it) ──
window.binarisChat = {
  createChat,
  updateChatTitle,
  sendMessage,
  listenToMessages,
  loadUserChats,
};

// ============================
// 🧱 CREATE CHAT
// ============================
export async function createChat(title = "New Chat") {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  const ref = await addDoc(collection(db, "chats"), {
    userId:    user.uid,
    title,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

// ============================
// ✏️ UPDATE CHAT TITLE
// ============================
export async function updateChatTitle(chatId, title) {
  if (!chatId) return;
  await updateDoc(doc(db, "chats", chatId), {
    title,
    updatedAt: serverTimestamp(),
  });
}

// ============================
// 💬 SEND MESSAGE
// ============================
export async function sendMessage(chatId, role, content) {
  if (!chatId) throw new Error("Missing chatId");

  await addDoc(collection(db, "chats", chatId, "messages"), {
    role,
    content,
    createdAt: serverTimestamp(),
  });
}

// ============================
// ⚡ REAL-TIME MESSAGE LISTENER
// ============================
export function listenToMessages(chatId, callback) {
  if (!chatId) return () => {}; // no-op unsubscribe

  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt")
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(messages);
  });
}

// ============================
// 📂 LOAD USER CHATS
// ============================
export async function loadUserChats() {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  const q = query(
    collection(db, "chats"),
    where("userId", "==", user.uid)
  );

  const snapshot = await getDocs(q);

  // Convert to the session format index.html understands:
  // { id, title, date, messages }
  // Messages are loaded on demand from the subcollection when a chat is opened.
  const chats = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id:       d.id,
      title:    data.title || "Untitled",
      // Firestore Timestamps have .toMillis(); fall back to now if null
      date:     data.updatedAt?.toMillis?.() ?? data.createdAt?.toMillis?.() ?? Date.now(),
      messages: [],          // populated on-demand when chat is opened
      _fromFirestore: true,  // flag so loadSession() knows to fetch messages
    };
  });

  // Sort newest first (same order as the sidebar renderSB())
  chats.sort((a, b) => b.date - a.date);
  return chats;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _hydrateUserBlocks(user) {
  const displayName = user.displayName || user.email || "You";
  const email       = user.email || "Google Account";
  const photoURL    = user.photoURL || null;
  const initials    = _initials(displayName);

  // Cache so addMsg() avatar patching (via window._applyUserAvatar) still works
  window._binarisUserInitials = initials;
  window._binarisUserPhoto    = photoURL;

  // Target every user block — covers desktop sidebar AND mobile drawer footer
  document.querySelectorAll(".sb-av").forEach((el) => _applyAvatar(el, photoURL, initials));
  document.querySelectorAll(".sb-uname").forEach((el) => { el.textContent = displayName; });
  document.querySelectorAll(".sb-uplan").forEach((el) => { el.textContent = email; });
}

function _applyAvatar(el, photoURL, initials) {
  if (!el) return;
  if (photoURL) {
    const img       = document.createElement("img");
    img.src         = photoURL;
    img.alt         = "";
    img.style.cssText =
      "width:100%;height:100%;border-radius:50%;object-fit:cover;display:block";
    img.onerror     = () => { img.remove(); el.textContent = initials; };
    el.textContent  = "";
    el.appendChild(img);
  } else {
    el.textContent = initials;
  }
}

function _initials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2
    ? parts[0][0] + parts[1][0]
    : name.slice(0, 2)
  ).toUpperCase();
}
