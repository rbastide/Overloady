import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { type ComponentType, type Ref, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { INJECTED_BRIDGE, originOf, parseBridgeMessage } from './src/bridge';

// The Overloady web app this shell opens: the Vite dev server on the LAN, or the deployed site.
// Set in mobile/.env (see .env.example), read when Metro starts.
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL?.trim() || '';
// Only this site gets the native bridge; any other page opens in the phone's browser
const WEB_ORIGIN = originOf(WEB_URL);

const BACKGROUND = '#0f1216';
const KEEP_AWAKE_TAG = 'overloady-session';

// The library forwards a ref with these commands but its typings leave the ref out
type WebViewHandle = { goBack: () => void; reload: () => void };
const ShellWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

/** The web app's vibration patterns, played as the phone does best: patterns on Android, haptics on iOS. */
const playVibration = (pattern: number | number[]) => {
  const steps = Array.isArray(pattern) ? pattern : [pattern];
  if (Platform.OS === 'android') {
    // React Native patterns start with a pause, web ones with a buzz
    Vibration.vibrate(steps.length === 1 ? steps[0] : [0, ...steps]);
    return;
  }
  const total = steps.reduce((sum, ms) => sum + ms, 0);
  if (steps.length === 1) Haptics.impactAsync(total < 50 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
  else Haptics.notificationAsync(total < 200 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
};

export default function App() {
  const webView = useRef<WebViewHandle>(null);
  const canGoBack = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Android back button walks the web history before leaving the app
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false;
      webView.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => {
    deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    if (originOf(event.nativeEvent.url) !== WEB_ORIGIN) return;
    const msg = parseBridgeMessage(event.nativeEvent.data);
    if (!msg) return;
    if (msg.type === 'vibrate') playVibration(msg.pattern);
    else if (msg.type === 'wake-lock') {
      if (msg.active) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      else deactivateKeepAwake(KEEP_AWAKE_TAG);
    } else if (msg.type === 'clipboard') Clipboard.setStringAsync(msg.text).catch(() => {});
  }, []);

  const retry = () => {
    setFailure(null);
    webView.current?.reload();
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        {WEB_URL ? (
          <ShellWebView
            ref={webView}
            source={{ uri: WEB_URL }}
            style={styles.web}
            containerStyle={styles.web}
            injectedJavaScriptBeforeContentLoaded={INJECTED_BRIDGE}
            onMessage={onMessage}
            originWhitelist={[WEB_ORIGIN]}
            onShouldStartLoadWithRequest={(request) => {
              const origin = originOf(request.url);
              // Sub-frames and non-web schemes (about:, blob:, data:) stay in place
              if (origin === WEB_ORIGIN || !origin || !request.isTopFrame) return true;
              Linking.openURL(request.url).catch(() => {});
              return false;
            }}
            onNavigationStateChange={(state) => (canGoBack.current = state.canGoBack)}
            onError={(event) => setFailure(event.nativeEvent.description || 'Chargement impossible')}
            onHttpError={(event) => {
              if (event.nativeEvent.url === WEB_URL) setFailure(`Erreur HTTP ${event.nativeEvent.statusCode}`);
            }}
            domStorageEnabled
            textZoom={100}
            bounces={false}
            overScrollMode="never"
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            webviewDebuggingEnabled={__DEV__}
          />
        ) : (
          <Notice title="Adresse de l'app manquante" body="Renseigne EXPO_PUBLIC_WEB_URL dans OverloadTrack/mobile/.env puis relance « npx expo start -c »." />
        )}
        {failure && <Notice title="Overloady ne répond pas" body={`${failure}\n${WEB_URL}`} onRetry={retry} overlay />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Notice({ title, body, onRetry, overlay }: { title: string; body: string; onRetry?: () => void; overlay?: boolean }) {
  return (
    <View style={[styles.notice, overlay && StyleSheet.absoluteFill]}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeBody}>{body}</Text>
      {onRetry && (
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Réessayer</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKGROUND },
  web: { flex: 1, backgroundColor: BACKGROUND },
  notice: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: BACKGROUND },
  noticeTitle: { color: '#f2f4f7', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  noticeBody: { color: '#9aa4b2', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2a313b' },
  buttonText: { color: '#f2f4f7', fontSize: 15, fontWeight: '600' },
});
