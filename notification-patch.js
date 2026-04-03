/**
 * ═══════════════════════════════════════════════════════════════
 *  BINARIS — Notification System Patch for index.html
 *  Apply these two changes to the existing JavaScript inside
 *  index.html to enable system (OS-level) notifications with the
 *  app logo for all key events, even when the app is in the foreground.
 * ═══════════════════════════════════════════════════════════════
 *
 *  CHANGE 1 — Replace the pushNotif() function
 *  ─────────────────────────────────────────────
 *  Find this block (around the "NOTIFICATION SYSTEM" comment):
 *
 *    function pushNotif({ type = 'info', title, sub = '', icon = '💬', detail = '', showSys = true }) {
 *      ...
 *      // Native OS notification (when app is in background)
 *      if (_notifPermission === 'granted' && document.hidden) {
 *        try {
 *          new Notification('Binaris — ' + title, {
 *            body: sub || detail,
 *            icon: './icon-192.png',
 *            badge: './icon-192.png',
 *            tag: 'binaris-' + type,
 *            silent: false,
 *          });
 *        } catch(_) {}
 *      }
 *    }
 *
 *  Replace the ENTIRE pushNotif function with the version below.
 *  Key differences:
 *    ① Added `forceNative` parameter — fires OS notification regardless of visibility
 *    ② badge + icon always point to icon-192.png (logo in notification tray + banner)
 *    ③ `renotify: true` lets repeat notifications show even with the same tag
 *    ④ Important events (start / end / voice / error) set forceNative = true in their callers
 * ═══════════════════════════════════════════════════════════════
 */

// ── REPLACEMENT pushNotif() ─────────────────────────────────────────────────
function pushNotif({ type = 'info', title, sub = '', icon = '💬', detail = '', showSys = true, forceNative = false }) {
  const id = ++_notifId;
  const now = new Date();
  const timeStr = now.toLocaleTimeString(curLang || 'en', { hour: '2-digit', minute: '2-digit' });
  const notif = { id, type, title, sub, icon, detail, time: timeStr, unread: true };
  _notifs.unshift(notif);
  if (_notifs.length > 50) _notifs.pop();

  // Update bell badge
  const badge = document.getElementById('notif-badge');
  if (badge) badge.classList.add('show');

  // Render in-app panel list
  renderNotifPanel();

  // In-app floating toast (top of screen)
  if (showSys) sysNotif({ type, title, sub, icon });

  // ── Native OS notification ──────────────────────────────────────────────
  // Fires when:
  //   a) app is in background (document.hidden), OR
  //   b) forceNative = true (key lifecycle events even when app is visible)
  if (_notifPermission === 'granted' && (forceNative || document.hidden)) {
    try {
      const n = new Notification('Binaris — ' + title, {
        body   : sub || detail || '',
        // icon  : full app icon shown in the notification banner / panel
        icon   : './icon-192.png',
        // badge : small monochrome logo shown in Android notification tray
        badge  : './icon-192.png',
        tag    : 'binaris-' + type,
        // renotify: show again even when same tag already exists
        renotify: forceNative,
        silent : (type === 'info'),  // only beep for important events
      });
      // Clicking the notification brings the PWA window into focus
      n.onclick = () => {
        window.focus?.();
        n.close();
      };
    } catch (_) { /* some browsers throw in certain contexts */ }
  }
}

/**
 *  CHANGE 2 — Update the automatic notification callers
 *  ─────────────────────────────────────────────────────
 *  Find the section "AUTOMATIC CHAT NOTIFICATIONS" and replace
 *  each function with its updated version below.
 *  The only change is adding `forceNative: true` to the important ones.
 */

// Conversation started — always notify (user just opened the app)
function notifyConversationStarted() {
  pushNotif({
    type       : 'ok',
    title      : 'Conversation started',
    sub        : 'Binaris is ready. Ask anything.',
    icon       : '💬',
    detail     : `Session: ${curSid?.slice(0,8) || '—'} · ${new Date().toLocaleTimeString()}`,
    showSys    : true,
    forceNative: true,           // ← always fire OS notification
  });
}

// AI is generating — log to panel only, not OS (fires too frequently)
function notifyAISpeaking(preview) {
  const shortened = preview ? preview.slice(0, 80) + (preview.length > 80 ? '…' : '') : '';
  pushNotif({
    type       : 'info',
    title      : 'Binaris is responding',
    sub        : shortened,
    icon       : '🤖',
    detail     : 'AI is generating a response',
    showSys    : false,
    forceNative: false,          // ← panel only (too frequent for OS)
  });
}

// Response fully received — notify always
function notifyAIDone(charCount) {
  pushNotif({
    type       : 'ok',
    title      : 'Response ready',
    sub        : `${charCount.toLocaleString()} characters generated`,
    icon       : '✓',
    detail     : 'Tap to read the full response',
    showSys    : false,
    forceNative: true,           // ← always fire OS notification
  });
}

// Voice character started speaking — always notify
function notifyVoiceStarted(charName) {
  pushNotif({
    type       : 'info',
    title      : `${charName} is speaking`,
    sub        : 'Voice mode active — Binaris is reading aloud',
    icon       : '🔊',
    showSys    : true,
    forceNative: true,           // ← always fire OS notification
  });
}

// Voice session ended
function notifyVoiceEnded() {
  pushNotif({
    type       : 'info',
    title      : 'Voice session ended',
    sub        : 'Conversation saved to history',
    icon       : '🔇',
    showSys    : false,
    forceNative: false,
  });
}

// User stopped generation
function notifyStopped() {
  pushNotif({
    type       : 'warn',
    title      : 'Generation stopped',
    sub        : 'Response was interrupted by user',
    icon       : '⏹',
    showSys    : false,
    forceNative: false,
  });
}

// Error — always surface to OS
function notifyError(msg) {
  pushNotif({
    type       : 'err',
    title      : 'Error',
    sub        : msg,
    icon       : '⚠️',
    showSys    : true,
    forceNative: true,           // ← always fire OS notification
  });
}
