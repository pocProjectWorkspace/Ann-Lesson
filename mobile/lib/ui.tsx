import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type TextInputProps, type ViewStyle } from "react-native";

/**
 * Design tokens, matching the web app: paper background, ink text, and a role
 * accent (teal for teachers, marigold for students). Serif display titles.
 */
export const palette = {
  paper: "#f4f5f7",
  card: "#ffffff",
  border: "#d9dee7",
  borderSoft: "#eceff4",
  ink950: "#0e1626",
  ink900: "#152036",
  ink700: "#2f3f5e",
  ink500: "#5c6b87",
  ink400: "#8390a8",
  ink300: "#b4bdcc",
  ink100: "#eceff4",
  leaf: "#1f7a4d",
  leafBg: "#dcf3e6",
  marigold: "#9c5d0b",
  marigoldBg: "#fdf0d8",
  rose: "#b4323f",
  roseBg: "#fde3e6",
  sky: "#2360c8",
  skyBg: "#dde8fb",
  teal: "#0f766e",
  tealBg: "#d5efeb",
  violet: "#4f46e5",
};

export const roleAccent = (role?: "STUDENT" | "TEACHER" | "PARENT" | null) => (role === "TEACHER" ? { main: palette.teal, soft: palette.tealBg } : { main: palette.marigold, soft: palette.marigoldBg });

let accent = roleAccent("STUDENT");
export function setAccent(role?: "STUDENT" | "TEACHER" | "PARENT" | null) {
  accent = roleAccent(role);
}
export const getAccent = () => accent;

/** Backwards-compatible colour object used across screens. */
export const colors = {
  bg: palette.paper,
  card: palette.card,
  border: palette.border,
  text: palette.ink900,
  muted: palette.ink500,
  get primary() {
    return accent.main;
  },
  get primarySoft() {
    return accent.soft;
  },
  primaryText: "#ffffff",
  green: palette.leaf,
  greenBg: palette.leafBg,
  amber: palette.marigold,
  amberBg: palette.marigoldBg,
  indigoBg: palette.skyBg,
  red: palette.rose,
  redBg: palette.roseBg,
};

export const serif = { fontFamily: "serif" as const };

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}
export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}
export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Button({ title, variant = "primary", loading, style, ...props }: PressableProps & { title: string; variant?: "primary" | "secondary" | "danger"; loading?: boolean; style?: ViewStyle }) {
  const primary = variant === "primary";
  const bg = primary ? colors.primary : colors.card;
  const fg = primary ? colors.primaryText : variant === "danger" ? colors.red : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      disabled={props.disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: bg }, !primary && { borderWidth: 1, borderColor: variant === "danger" ? "#f3c2c8" : palette.border }, (pressed || props.disabled || loading) && { opacity: 0.7 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={palette.ink400} {...props} style={[styles.input, props.style]} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "indigo" | "red" | "accent" }) {
  const map = {
    slate: { bg: palette.ink100, fg: palette.ink700 },
    green: { bg: palette.leafBg, fg: palette.leaf },
    amber: { bg: palette.marigoldBg, fg: palette.marigold },
    indigo: { bg: palette.skyBg, fg: palette.sky },
    red: { bg: palette.roseBg, fg: palette.rose },
    accent: { bg: colors.primarySoft, fg: colors.primary },
  }[tone];
  return (
    <View style={{ backgroundColor: map.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ color: map.fg, fontSize: 12, fontWeight: "700" }}>{children}</Text>
    </View>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <View style={{ backgroundColor: palette.roseBg, borderColor: "#f3c2c8", borderWidth: 1, borderRadius: 10, padding: 10 }}>
      <Text style={{ color: palette.rose, fontSize: 14, fontWeight: "600" }}>{message}</Text>
    </View>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={{ padding: 40, alignItems: "center", gap: 10 }}>
      <ActivityIndicator color={colors.primary} />
      <Muted>{label}</Muted>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <View style={{ borderStyle: "dashed", borderWidth: 1, borderColor: palette.ink300, borderRadius: 12, padding: 24, alignItems: "center" }}>
      <Muted style={{ textAlign: "center", lineHeight: 20 }}>{children}</Muted>
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={{ height: 8, borderRadius: 999, backgroundColor: palette.ink100, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", backgroundColor: colors.primary }} />
    </View>
  );
}

/** Coloured spine on subject and class cards, like the web bookshelf. */
export const spineColors = ["#2360c8", "#0f766e", "#9c5d0b", "#4f46e5", "#b4323f", "#1f7a4d", "#7c3aed", "#0369a1"];
export const spineColor = (i: number) => spineColors[i % spineColors.length];

export function SpineCard({ index, children, style }: { index: number; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.card, { flexDirection: "row", padding: 0, overflow: "hidden" }, style]}>
      <View style={{ width: 10, backgroundColor: spineColor(index) }} />
      <View style={{ flex: 1, padding: 16, gap: 6 }}>{children}</View>
    </View>
  );
}

export function OfflineBanner({ cachedAt }: { cachedAt: number | null }) {
  const when = cachedAt ? new Date(cachedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: palette.marigoldBg, borderColor: "#f3dcae", borderWidth: 1, borderRadius: 10, padding: 10 }}>
      <Text style={{ color: palette.marigold, fontWeight: "700", fontSize: 13 }}>You are offline. Showing what was saved{when ? ` on ${when}` : ""}.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  title: { fontSize: 26, fontWeight: "700", color: palette.ink950, ...serif, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, color: palette.ink500, lineHeight: 21 },
  muted: { fontSize: 13, color: palette.ink500 },
  button: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", minHeight: 46 },
  buttonText: { fontSize: 15, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "700", color: palette.ink700 },
  input: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: palette.ink900 },
  hint: { fontSize: 12, color: palette.ink500 },
});
