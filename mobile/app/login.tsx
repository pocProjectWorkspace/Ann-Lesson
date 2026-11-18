import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { Button, Card, ErrorBox, Field, Muted, colors, palette } from "../lib/ui";
import { API_URL } from "../lib/config";

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [schoolCode, setSchoolCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          <Field label="Username or student ID" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} returnKeyType="next" />
          <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} returnKeyType="go" onSubmitEditing={submit} />
          <Button title="Sign in" onPress={submit} loading={busy} disabled={!schoolCode || !username || !password} style={{ backgroundColor: palette.violet }} />
        </Card>
        <Muted style={{ textAlign: "center", marginTop: 16 }}>Server: {API_URL}</Muted>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
