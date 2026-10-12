import api from '../api';

/**
 * End-of-rest notifications through Web Push. On iPhone they need the app added to the home screen
 * (iOS 16.4+): a web app is suspended in the background, so the server sends the notification.
 */
export const restNotificationsSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const restNotificationsPermission = (): NotificationPermission | 'unsupported' =>
  restNotificationsSupported() ? Notification.permission : 'unsupported';

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

const registerWorker = () => {
  registration ??= navigator.serviceWorker
    .register('/sw.js')
    .then(() => navigator.serviceWorker.ready)
    .catch(() => null);
  return registration;
};

const toBase64Url = (buffer: ArrayBuffer | null) =>
  buffer
    ? btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    : '';

const fromBase64Url = (value: string) => {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

/** Subscribes this device (again if the server key changed) and hands the subscription to the server. */
const subscribeDevice = async () => {
  const reg = await registerWorker();
  if (!reg) return false;

  const { data } = await api.get('/push/public-key');
  const publicKey: string = data?.publicKey;
  if (!publicKey) return false;

  let subscription = await reg.pushManager.getSubscription();
  const subscribedKey = subscription?.options.applicationServerKey ?? null;
  if (subscription && subscribedKey && toBase64Url(subscribedKey) !== publicKey) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(publicKey),
  });

  await api.post('/push/subscribe', subscription.toJSON());
  return true;
};

/**
 * Asks for the permission and subscribes. Must run from a tap: iOS only shows the prompt
 * in response to a user gesture, so the permission is requested before anything else is awaited.
 */
export const enableRestNotifications = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (!restNotificationsSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    try {
      await subscribeDevice();
    } catch {
      return 'default';
    }
  }
  return permission;
};

let synced = false;

/** Once per visit: makes sure the server knows this device when notifications are already allowed. */
export const syncRestNotifications = () => {
  if (synced || restNotificationsPermission() !== 'granted') return;
  synced = true;
  subscribeDevice().catch(() => {
    synced = false;
  });
};

// Requests run one after the other: a "cancel" followed by a new "schedule" (+30s) never arrives reversed
let queue: Promise<unknown> = Promise.resolve();
const enqueue = (task: () => Promise<unknown>) => {
  queue = queue.then(task).catch(() => undefined);
};

/** The server notifies this athlete's devices at `endsAt` (ms timestamp). */
export const scheduleRestNotification = (endsAt: number) => {
  if (restNotificationsPermission() !== 'granted') return;
  enqueue(async () => {
    // Measured when sent, so time spent waiting in the queue is not counted twice
    const seconds = (endsAt - Date.now()) / 1000;
    if (seconds > 0) await api.post('/push/rest', { seconds });
  });
};

export const cancelRestNotification = () => {
  if (restNotificationsPermission() !== 'granted') return;
  enqueue(() => api.delete('/push/rest'));
};
