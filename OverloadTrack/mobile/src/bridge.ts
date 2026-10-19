// The web app runs unchanged inside the WebView. This script, injected before it loads, routes the
// browser APIs the WebView lacks (vibration, screen wake lock, clipboard over plain http) to the
// phone through postMessage; App.tsx answers them with the matching Expo modules.

export type BridgeMessage =
  | { type: 'vibrate'; pattern: number | number[] }
  | { type: 'wake-lock'; active: boolean }
  | { type: 'clipboard'; text: string };

export const INJECTED_BRIDGE = `
(function () {
  if (window.__overloadyNative) return;
  window.__overloadyNative = true;
  var post = function (msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); };

  navigator.vibrate = function (pattern) {
    post({ type: 'vibrate', pattern: pattern });
    return true;
  };

  // One shared lock on the native side: it stays on while any sentinel is held
  var held = 0;
  var wakeLock = {
    request: function () {
      held += 1;
      if (held === 1) post({ type: 'wake-lock', active: true });
      var sentinel = {
        released: false,
        type: 'screen',
        onrelease: null,
        addEventListener: function () {},
        removeEventListener: function () {},
        release: function () {
          if (!sentinel.released) {
            sentinel.released = true;
            held -= 1;
            if (held === 0) post({ type: 'wake-lock', active: false });
          }
          return Promise.resolve();
        },
      };
      return Promise.resolve(sentinel);
    },
  };
  try { Object.defineProperty(navigator, 'wakeLock', { value: wakeLock, configurable: true }); } catch (e) {}

  var clipboard = {
    writeText: function (text) { post({ type: 'clipboard', text: String(text) }); return Promise.resolve(); },
    readText: function () { return Promise.resolve(''); },
  };
  try { Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true }); } catch (e) {}
})();
true;
`;

/** "scheme://host:port" of an http(s) URL, '' for anything else (about:, blob:, data:, malformed). */
export const originOf = (url: string): string => /^https?:\/\/[^/?#]+/i.exec(url)?.[0].toLowerCase() ?? '';

const isPattern = (value: unknown): value is number | number[] =>
  typeof value === 'number' || (Array.isArray(value) && value.length <= 16 && value.every((ms) => typeof ms === 'number'));

/** The page's message, or null when it is not one of the shapes the bridge sends. */
export const parseBridgeMessage = (data: string): BridgeMessage | null => {
  try {
    const msg = JSON.parse(data);
    if (msg?.type === 'vibrate' && isPattern(msg.pattern)) return { type: 'vibrate', pattern: msg.pattern };
    if (msg?.type === 'wake-lock' && typeof msg.active === 'boolean') return { type: 'wake-lock', active: msg.active };
    if (msg?.type === 'clipboard' && typeof msg.text === 'string') return { type: 'clipboard', text: msg.text };
    return null;
  } catch {
    return null;
  }
};
