// ═══════════════════════════════════════════
//  chat.js — Binaris Firestore Chat Manager
//  v2 — Persistent real-time chatting
//  · Real-time chat list (onSnapshot → sidebar stays live)
//  · Real-time message subscription per active chat
//  · Auto-loads all chats immediately on sign-in
//  · Graceful unsubscribe on chat switch / sign-out
// ═══════════════════════════════════════════
import { auth, db, onAuthStateChanged } from "./firebase-init.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ── Active subscription handles ──────────────────────────────────────────────
let _chatListUnsub   = null; // real-time chat list listener
let _activeMsgUnsub  = null; // real-time message listener for the open chat
let _currentChatId   = null; // which chat is currently open

// ── Auth listener ─────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    _onSignedIn(user);
  } else {
    _onSignedOut();
  }
});

function _onSignedIn(user) {
  // 1. Mark user as signed in — prevents index.html from loading stale localStorage sessions
  window._binarisUserSignedIn = true;

  // 2. Fill in user blocks (avatar / name / email) across the whole page
  _hydrateUserBlocks(user);

  // 3. Clear any stale localStorage sessions to avoid conflicts with Firestore.
  //    Chats are now loaded exclusively from the cloud for signed-in users.
  if (typeof window.clearLocalSessions === 'function') {
    window.clearLocalSessions();
  }

  // 4. Subscribe to this user's chat list in real-time.
  //    The callback fires immediately with the current snapshot, so chats load
  //    right away on startup — and again whenever the list changes (new chat,
  //    title update, deletion from another device).
  _subscribeChatList(user.uid);
}

function _onSignedOut() {
  // Tear down all subscriptions cleanly
  _chatListUnsub?.();   _chatListUnsub  = null;
  _activeMsgUnsub?.();  _activeMsgUnsub = null;
  _currentChatId = null;
  window._binarisUserSignedIn = false;
}

// ── Real-time chat list ───────────────────────────────────────────────────────
function _subscribeChatList(uid) {
  // Cancel any previous subscription (e.g. after a sign-out / sign-in cycle)
  _chatListUnsub?.();

  const q = query(
    collection(db, "chats"),
    where("userId", "==", uid),
    orderBy("updatedAt", "desc")
  );

  _chatListUnsub = onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id:             d.id,
        title:          data.title || "Untitled",
        date:           data.updatedAt?.toMillis?.() ?? data.createdAt?.toMillis?.() ?? Date.now(),
        messages:       [],          // loaded on-demand via subscribeToMessages
        _fromFirestore: true,
      };
    });

    // Inject into sidebar — works whether the page just loaded or the user
    // has been using the app for a while.
    if (typeof window.injectFirestoreChats === "function") {
      window.injectFirestoreChats(chats);
    } else {
      window._binarisQueuedChats = chats; // drained by index.html after it boots
    }
  }, (err) => {
    // Firestore may require a composite index for where+orderBy.
    // Fall back to a simpler query (no orderBy) so the app still works.
    console.warn("[Binaris Chat] Chat list query failed, retrying without orderBy:", err.message);
    _subscribeChatListFallback(uid);
  });
}

function _subscribeChatListFallback(uid) {
  _chatListUnsub?.();
  const q = query(collection(db, "chats"), where("userId", "==", uid));
  _chatListUnsub = onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id:             d.id,
        title:          data.title || "Untitled",
        date:           data.updatedAt?.toMillis?.() ?? data.createdAt?.toMillis?.() ?? Date.now(),
        messages:       [],
        _fromFirestore: true,
      };
    }).sort((a, b) => b.date - a.date);

    if (typeof window.injectFirestoreChats === "function") {
      window.injectFirestoreChats(chats);
    } else {
      window._binarisQueuedChats = chats;
    }
  });
}

// ── Real-time message subscription ───────────────────────────────────────────
// Called by index.html's loadSession() when the user opens a chat.
// Returns the unsubscribe function so the caller can cancel it when needed.
function subscribeToMessages(chatId, callback) {
  if (!chatId) return () => {};

  // Cancel the previous chat's listener
  if (_activeMsgUnsub && _currentChatId !== chatId) {
    _activeMsgUnsub();
    _activeMsgUnsub = null;
  }

  _currentChatId = chatId;

  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt")
  );

  _activeMsgUnsub = onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((d) => ({
      id:      d.id,
      role:    d.data().role,
      content: d.data().content,
    }));
    callback(messages);
  }, (err) => {
    console.error("[Binaris Chat] Message subscription error:", err);
  });

  return () => {
    _activeMsgUnsub?.();
    _activeMsgUnsub = null;
    if (_currentChatId === chatId) _currentChatId = null;
  };
}

// ============================
// 📥 GET MESSAGES (for polling)
// ============================
// Used by the 1.2 s interval in index.html as a backup to onSnapshot.
// Returns an array of { id, role, content } objects ordered by createdAt.
async function getMessages(chatId) {
  if (!chatId) return [];
  try {
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({
      id:      d.id,
      role:    d.data().role,
      content: d.data().content,
    }));
  } catch (e) {
    console.warn("[Binaris] getMessages error:", e.message);
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
window.binarisChat = {
  createChat,
  updateChatTitle,
  sendMessage,
  deleteChat,                           // NEW — delete chat + all its messages
  getMessages,                          // used by polling interval
  listenToMessages: subscribeToMessages, // alias kept for compat
  subscribeToMessages,
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
// ✏️ UPDATE CHAT TITLE + TIMESTAMP
// ============================
export async function updateChatTitle(chatId, title) {
  if (!chatId) return;
  try {
    await updateDoc(doc(db, "chats", chatId), {
      title,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    // Non-fatal — local state is the fallback
  }
}

// ============================
// 💬 SEND MESSAGE
// ============================
export async function sendMessage(chatId, role, content) {
  if (!chatId) throw new Error("Missing chatId");

  const ref = await addDoc(collection(db, "chats", chatId, "messages"), {
    role,
    content,
    createdAt: serverTimestamp(),
  });

  // Touch updatedAt on the parent chat so the list re-sorts correctly
  await updateDoc(doc(db, "chats", chatId), {
    updatedAt: serverTimestamp(),
  }).catch(() => {});

  // Return the Firestore doc ID so the UI can track it and prevent
  // the polling interval from re-rendering the same message.
  return ref.id;
}

// ============================
// 🗑️ DELETE CHAT + ALL MESSAGES
// ============================
export async function deleteChat(chatId) {
  if (!chatId) return;
  try {
    // 1. Batch-delete all messages in the subcollection
    const msgsSnap = await getDocs(collection(db, "chats", chatId, "messages"));
    await Promise.all(msgsSnap.docs.map(d => deleteDoc(d.ref)));
    // 2. Delete the chat document itself
    await deleteDoc(doc(db, "chats", chatId));
  } catch (e) {
    console.warn("[Binaris Chat] deleteChat error:", e.message);
    throw e; // re-throw so caller can handle
  }
}

function _hydrateUserBlocks(user) {
  const displayName = user.displayName || user.email || "You";
  const email       = user.email || "Google Account";
  const photoURL    = user.photoURL || null;
  const initials    = _initials(displayName);

  window._binarisUserInitials = initials;
  window._binarisUserPhoto    = photoURL;

  document.querySelectorAll(".sb-av").forEach((el)    => _applyAvatar(el, photoURL, initials));
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
    img.onerror = () => { img.remove(); el.textContent = initials; };
    el.textContent  = "";
    el.appendChild(img);
  } else {
    el.textContent = initials;
  }
}

function _initials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}
