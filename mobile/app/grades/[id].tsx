import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api, type Gradebook } from "../../lib/api";
import { useCached } from "../../lib/use-cached";
import { Badge, Card, Empty, ErrorBox, Loading, Muted, OfflineBanner, ProgressBar, colors, palette } from "../../lib/ui";

const LABELS: Record<number, string> = { 5: "Excellent", 4: "Good", 3: "Satisfactory", 2: "Developing", 1: "Needs support" };

/**
 * Teacher: the class ranking by overall grade, and tap-to-rate for every student and
 * subject. Each tap saves immediately and the ranking updates.
 */
export default function GradesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: book, setData, error: loadError, offline, cachedAt, refreshing, refresh } = useCached<Gradebook>(`grades:${id}`, () => api.gradebook(id), [id]);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const rate = async (studentId: string, subjectId: string, rating: number | null) => {
    setSaving(`${studentId}:${subjectId}`);
    setSaveError(null);
    try {
      await api.setGrade(id, studentId, subjectId, rating);
      const fresh = await api.gradebook(id);
      setData(fresh);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save the grade");
    } finally {
      setSaving(null);
    }
  };

  const graded = book?.students.filter((s) => s.overall !== null) ?? [];
  return (
    <>
      <Stack.Screen options={{ title: book ? `${book.name}: grades` : "Grades" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {offline ? <OfflineBanner cachedAt={cachedAt} /> : null}
        {loadError ? <ErrorBox message={loadError} /> : null}
        {saveError ? <ErrorBox message={saveError} /> : null}
        {!book && !loadError ? <Loading /> : null}

        {book ? (
          <Card style={{ padding: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: palette.ink950, padding: 14, paddingBottom: 2, fontFamily: "serif" }}>Class ranking</Text>
            <Muted style={{ paddingHorizontal: 14, paddingBottom: 8 }}>{graded.length ? `${graded.length} of ${book.students.length} graded, class average ${book.classAverage}%` : "No grades yet. Tap a student below to rate them."}</Muted>
            {graded.length === 0 ? <Empty>Nothing to rank yet.</Empty> : null}
            {graded.map((s) => (
              <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ width: 26, fontSize: 18, color: colors.muted, fontFamily: "serif" }}>{s.rank}</Text>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontWeight: "700", color: palette.ink950 }}>
                    {s.name}
                  </Text>
                  <View style={{ marginTop: 6 }}>
                    <ProgressBar value={s.overall ?? 0} />
                  </View>
                </View>
                <Badge tone={(s.overall ?? 0) >= 80 ? "green" : (s.overall ?? 0) >= 60 ? "accent" : "amber"}>{s.overall}%</Badge>
              </View>
            ))}
          </Card>
        ) : null}

        {book ? (
          <Card style={{ padding: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: palette.ink950, padding: 14, paddingBottom: 2, fontFamily: "serif" }}>Enter grades</Text>
            <Muted style={{ paddingHorizontal: 14, paddingBottom: 8 }}>Tap a student, then a rating for each subject. 1 is needs support, 5 is excellent.</Muted>
            {book.students.length === 0 ? <Empty>No students in this class.</Empty> : null}
            {book.students.map((s) => {
              const isOpen = open === s.id;
              return (
                <View key={s.id} style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Pressable onPress={() => setOpen(isOpen ? null : s.id)} accessibilityRole="button" accessibilityLabel={`${s.name}, overall ${s.overall ?? "not graded"}`} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", padding: 12, paddingHorizontal: 14, backgroundColor: pressed ? palette.paper : undefined })}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", color: palette.ink950 }}>{s.name}</Text>
                      <Muted>{s.ratings.filter((r) => r.rating).length} of {book.subjects.length} subjects graded</Muted>
                    </View>
                    <Text style={{ fontWeight: "700", color: palette.ink900 }}>{s.overall === null ? "–" : `${s.overall}%`}</Text>
                  </Pressable>
                  {isOpen
                    ? book.subjects.map((sub) => {
                        const current = s.ratings.find((r) => r.subjectId === sub.id)?.rating ?? null;
                        const busy = saving === `${s.id}:${sub.id}`;
                        return (
                          <View key={sub.id} style={{ paddingHorizontal: 14, paddingBottom: 10, gap: 6 }}>
                            <Muted>
                              {sub.name}
                              {current ? ` · ${LABELS[current]}` : ""}
                            </Muted>
                            <View style={{ flexDirection: "row", gap: 6 }}>
                              {[1, 2, 3, 4, 5].map((v) => (
                                <Pressable key={v} disabled={busy} onPress={() => rate(s.id, sub.id, current === v ? null : v)} accessibilityRole="button" accessibilityLabel={`${sub.name}: ${v}, ${LABELS[v]}`} style={{ width: 40, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: current === v ? colors.primary : colors.border, backgroundColor: current === v ? colors.primary : "#fff", opacity: busy ? 0.5 : 1 }}>
                                  <Text style={{ fontWeight: "700", color: current === v ? "#fff" : palette.ink900 }}>{v}</Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        );
                      })
                    : null}
                </View>
              );
            })}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}
