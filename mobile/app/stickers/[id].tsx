import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api, type ClassStickers } from "../../lib/api";
import { useCached } from "../../lib/use-cached";
import { Button, Card, Empty, ErrorBox, Loading, Muted, OfflineBanner, colors, palette } from "../../lib/ui";

/**
 * Teacher: pick a sticker, tap the children who earned it, add a word, give. Below, every
 * child's streak and latest stickers.
 */
export default function StickersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, setData, error: loadError, offline, cachedAt, refreshing, refresh } = useCached<ClassStickers>(`stickers:${id}`, () => api.classStickers(id), [id]);
  const [kind, setKind] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = kind ?? data?.kinds[0]?.kind ?? null;
  const toggle = (sid: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });

  const give = async () => {
    if (!chosen || picked.size === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.giveSticker(id, [...picked], chosen, note.trim() || undefined);
      const k = data?.kinds.find((x) => x.kind === chosen);
      setMessage(`${k?.emoji ?? ""} ${k?.label ?? "Sticker"} given to ${picked.size} ${picked.size === 1 ? "child" : "children"}`);
      setPicked(new Set());
      setNote("");
      setData(await api.classStickers(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not give the sticker");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Stickers" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {offline ? <OfflineBanner cachedAt={cachedAt} /> : null}
        {loadError ? <ErrorBox message={loadError} /> : null}
        {error ? <ErrorBox message={error} /> : null}
        {!data && !loadError ? <Loading /> : null}

        {data ? (
          <Card>
            <Text style={{ fontSize: 18, fontWeight: "700", color: palette.ink950, fontFamily: "serif" }}>Give a sticker</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {data.kinds.map((k) => {
                const on = k.kind === chosen;
                return (
                  <Pressable key={k.kind} onPress={() => setKind(k.kind)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${k.label}, ${k.hint}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: on ? "#f59e0b" : colors.border, backgroundColor: on ? "#fffbeb" : "#fff", paddingVertical: 8, paddingHorizontal: 10 }}>
                    <Text style={{ fontSize: 20 }}>{k.emoji}</Text>
                    <Text style={{ fontWeight: "700", color: palette.ink900, fontSize: 13 }}>{k.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Muted style={{ marginTop: 12 }}>Who earned it</Muted>
            {data.students.length === 0 ? <Empty>No students in this class.</Empty> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {data.students.map((s) => {
                const on = picked.has(s.id);
                return (
                  <Pressable key={s.id} onPress={() => toggle(s.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={s.name} style={{ borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "#fff", paddingVertical: 6, paddingHorizontal: 12 }}>
                    <Text style={{ color: on ? "#fff" : palette.ink900, fontWeight: "600", fontSize: 13 }}>{s.name.split(" ")[0]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput value={note} onChangeText={setNote} placeholder="A word for them (optional)" maxLength={120} accessibilityLabel="A word for them" style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: palette.ink950 }} />
            <Button title={busy ? "Giving…" : picked.size ? `Give to ${picked.size}` : "Give sticker"} disabled={busy || picked.size === 0 || !chosen} style={{ marginTop: 10 }} onPress={give} />
            {message ? <Text style={{ marginTop: 8, color: "#166534", fontWeight: "600" }}>{message}</Text> : null}
          </Card>
        ) : null}

        {data ? (
          <Card style={{ padding: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: palette.ink950, padding: 14, paddingBottom: 2, fontFamily: "serif" }}>Shelves</Text>
            <Muted style={{ paddingHorizontal: 14, paddingBottom: 8 }}>Each child&apos;s streak and latest stickers.</Muted>
            {data.students.map((s) => (
              <View key={s.id} style={{ padding: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.border, gap: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontWeight: "700", color: palette.ink950 }}>{s.name}</Text>
                  <Text style={{ color: s.streak.current ? "#9a3412" : colors.muted, fontSize: 12, fontWeight: "600" }}>{s.streak.current ? `🔥 ${s.streak.current} day${s.streak.current === 1 ? "" : "s"}${s.streak.readToday ? "" : " (not yet today)"}` : s.streak.best ? `Best ${s.streak.best}` : "No streak yet"}</Text>
                </View>
                <Text style={{ fontSize: 20 }} accessibilityLabel={s.stickers.length ? s.stickers.slice(0, 12).map((x) => x.label).join(", ") : "No stickers yet"}>
                  {s.stickers.length ? s.stickers.slice(0, 12).map((x) => x.emoji).join(" ") : <Text style={{ fontSize: 13, color: colors.muted }}>No stickers yet</Text>}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}
