import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, ErrorBox, Field, Muted, colors, palette } from "../lib/ui";
import { API_URL } from "../lib/config";

WebBrowser.maybeCompleteAuthSession();

type Options = { name: string; mode: "FORM" | "MICROSOFT" | "GOOGLE"; provider: string | null; studentsSso: boolean };

/** Reads the token and user the server put in the redirect's hash fragment. */
function parseSsoReturn(url: string): { token: string; user: User } | null {
  const hash = url.split("#")[1];
  if (!hash) return null;
  const p = new URLSearchParams(hash);
  const token = p.get("token");
  const user = p.get("user");
  if (!token || !user) return null;
  try {
    // base64url → base64, then decode; atob exists on web and in Hermes.
    const b64 = user.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(user.length / 4) * 4, "=");
    const json = decodeURIComponent(Array.from(atob(b64), (ch) => "%" + ch.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
    return { token, user: JSON.parse(json) as User };
  } catch {
    return null;
  }
}

export default function Login() {
  const { signIn, signInWithToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [schoolCode, setSchoolCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fetched, setFetched] = useState<{ code: string; options: Options | null }>({ code: "", options: null });
  const code = schoolCode.trim().toUpperCase();
  const options = fetched.code === code ? fetched.options : null;

  // Find out how this school signs in, so the provider button can appear for staff.
  useEffect(() => {
    if (code.length < 3) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .loginOptions(code)
        .then((o) => !cancelled && setFetched({ code, options: o.mode === "FORM" ? null : o }))
        .catch(() => !cancelled && setFetched({ code, options: null }));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(schoolCode, username, password);
      router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  // Single sign-on: open the provider in a secure in-app browser; the server redirects
  // back to the app with a session token in the URL fragment.
  const sso = async () => {
    setError(null);
    setBusy(true);
    try {
      const redirect = Platform.OS === "web" ? `${window.location.origin}/sso` : Linking.createURL("sso");
      const start = `${API_URL}/api/auth/sso/start?school=${encodeURIComponent(code)}&client=mobile&redirect=${encodeURIComponent(redirect)}`;
      const result = await WebBrowser.openAuthSessionAsync(start, redirect);
      if (result.type !== "success") {
        if (result.type === "cancel" || result.type === "dismiss") return;
        throw new Error("Sign-in did not complete");
      }
      const got = parseSsoReturn(result.url);
      if (!got) {
        const reason = new URL(result.url).searchParams.get("message") ?? "The school account was not accepted.";
        throw new Error(reason);
      }
      await signInWithToken(got.token, got.user);
      router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", marginBottom: 24, gap: 8 }}>
          <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: palette.violet, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 20 }}>LP</Text>
          </View>
          <Text style={{ fontSize: 26, fontWeight: "700", color: palette.ink950, fontFamily: "serif" }}>Lesson Plan</Text>
          <Muted>Every lesson, in order. Sign in with the details from your school.</Muted>
        </View>
        <Card style={{ gap: 14 }}>
          {error ? <ErrorBox message={error} /> : null}
          <Field label="School code" placeholder="e.g. GREENWOOD" autoCapitalize="characters" autoCorrect={false} value={schoolCode} onChangeText={setSchoolCode} returnKeyType="next" />
          {options ? (
            <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.borderSoft }}>
              <Button title={`Sign in with ${options.provider}`} variant="secondary" onPress={sso} loading={busy} />
              <Muted>{options.studentsSso ? `Staff and students of ${options.name} can use the school account. Students can also sign in below.` : `Teachers of ${options.name} use the school account. Students sign in below with their student ID.`}</Muted>
            </View>
          ) : null}
          <Field label={options ? "Student ID" : "Username or student ID"} autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} returnKeyType="next" />
          <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} returnKeyType="go" onSubmitEditing={submit} />
          <Button title="Sign in" onPress={submit} loading={busy} disabled={!schoolCode || !username || !password} style={{ backgroundColor: palette.violet }} />
        </Card>
        <Muted style={{ textAlign: "center", marginTop: 16 }}>Server: {API_URL}</Muted>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
