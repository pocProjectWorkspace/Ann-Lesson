import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useCached } from "../../lib/use-cached";
import { Badge, Card, Empty, ErrorBox, Loading, Muted, OfflineBanner, ProgressBar, colors, palette } from "../../lib/ui";

export default function SubjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: subject, error, offline, cachedAt, refreshing, refresh } = useCached(`subject:${id}`, () => api.subject(id), [id]);
  const pct = subject?.lessonCount ? Math.round((subject.learntCount / subject.lessonCount) * 100) : 0;

  return (
    <>
      <Stack.Screen options={{ title: subject?.name ?? "Subject" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {offline ? <OfflineBanner cachedAt={cachedAt} /> : null}
        {error ? <ErrorBox message={error} /> : null}
        {!subject && !error ? <Loading /> : null}
        {subject ? (
          <View style={{ gap: 6 }}>
            <Muted>
              {subject.learntCount} of {subject.lessonCount} lesson{subject.lessonCount === 1 ? "" : "s"} learnt
            </Muted>
            <ProgressBar value={pct} />
          </View>
        ) : null}
        {subject && subject.lessons.length === 0 ? <Empty>No lessons have been published in this subject yet.</Empty> : null}
        {subject && subject.lessons.length > 0 ? (
          <Card style={{ padding: 0 }}>
            {subject.lessons.map((l, i) => (
              <Pressable
                key={l.id}
                onPress={() => router.push({ pathname: "/lesson/[id]", params: { id: l.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${l.title}, ${l.state === "confirmed" ? "confirmed" : l.state === "learnt" ? "learnt" : l.state === "viewed" ? "in progress" : "new"}`}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: palette.borderSoft, backgroundColor: pressed ? palette.paper : undefined })}
              >
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: l.learnt ? colors.primary : palette.ink100, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontWeight: "700", color: l.learnt ? "#fff" : palette.ink700, fontFamily: "serif" }}>{l.learnt ? "✓" : i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontWeight: "700", color: palette.ink950, fontSize: 16, fontFamily: "serif" }}>
                    {l.title}
                  </Text>
                  {l.description ? <Muted style={{ marginTop: 2 }}>{l.description.length > 60 ? l.description.slice(0, 60) + "…" : l.description}</Muted> : null}
                </View>
                {l.state === "confirmed" ? <Badge tone="green">Confirmed</Badge> : l.learnt ? <Badge tone="green">Learnt</Badge> : l.viewed ? <Badge tone="accent">In progress</Badge> : <Badge>New</Badge>}
              </Pressable>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}
