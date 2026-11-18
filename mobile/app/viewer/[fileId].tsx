import { useEffect, useState, type ComponentType } from "react";
import { Platform, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api } from "../../lib/api";
import { API_URL } from "../../lib/config";
import { Button, ErrorBox, Loading } from "../../lib/ui";

/**
 * Full-screen book viewer. The web server renders the page-turning book (the
 * same component as the web app). We open the embedded viewer with a short-lived
 * hand-off token in the URL, which the server validates on the page and on the
 * PDF request itself, so it works even when the web view drops cookies.
 */
export default function ViewerScreen() {
  const { fileId, title } = useLocalSearchParams<{ fileId: string; title?: string }>();
  // One state object keyed by attempt, so a retry or a new file resets the
  // screen without calling setState synchronously inside the effect.
  const [state, setState] = useState<{ key: string; uri: string | null; error: string | null }>({ key: "", uri: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const key = `${fileId}:${attempt}`;
  const current = state.key === key ? state : { key, uri: null, error: null };
  const { uri, error } = current;
  const setError = (m: string) => setState({ key, uri: null, error: m });

  useEffect(() => {
    let cancelled = false;
    api
      .webviewToken()
      .then(({ token }) => {
        if (cancelled) return;
        setState({ key, uri: `${API_URL}/embed/viewer/${fileId}?t=${encodeURIComponent(token)}`, error: null });
      })
      .catch((e) => !cancelled && setState({ key, uri: null, error: e instanceof Error ? e.message : "Could not open the book" }));
    return () => {
      cancelled = true;
    };
  }, [fileId, key]);

  return (
    <View style={{ flex: 1, backgroundColor: "#0e1626" }}>
      <Stack.Screen options={{ title: title ?? "Book", headerStyle: { backgroundColor: "#0e1626" }, headerTintColor: "#fff" }} />
      {error ? (
        <View style={{ padding: 20, gap: 12 }}>
          <ErrorBox message={error} />
          <Button title="Try again" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />
        </View>
      ) : null}
      {!uri && !error ? <Loading label="Opening book…" /> : null}
      {uri ? Platform.OS === "web" ? <WebFrame uri={uri} title={title ?? "Book"} /> : <NativeWebView uri={uri} onError={setError} /> : null}
    </View>
  );
}

/** On the web build there is no WebView component; an iframe does the same job. */
function WebFrame({ uri, title }: { uri: string; title: string }) {
  // react-native-web renders View as a div, so a raw iframe element is fine here.
  const Iframe = "iframe" as unknown as ComponentType<Record<string, unknown>>;
  return <Iframe src={uri} title={title} style={{ flex: 1, width: "100%", height: "100%", border: 0, background: "#0e1626" }} />;
}

function NativeWebView({ uri, onError }: { uri: string; onError: (m: string) => void }) {
  // Loaded lazily so the web bundle never imports react-native-webview.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WebView } = require("react-native-webview") as typeof import("react-native-webview");
  return (
    <WebView
      source={{ uri }}
      style={{ flex: 1, backgroundColor: "#0e1626" }}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      setSupportMultipleWindows={false}
      startInLoadingState
      renderLoading={() => <Loading label="Preparing pages…" />}
      onError={(e) => onError(e.nativeEvent.description || "Could not load the book")}
      onHttpError={(e) => (e.nativeEvent.statusCode >= 400 ? onError(`The server answered ${e.nativeEvent.statusCode}. Go back and open the lesson again.`) : undefined)}
    />
  );
}
