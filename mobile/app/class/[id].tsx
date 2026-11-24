import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../lib/api";
import { useCached } from "../../lib/use-cached";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Muted, OfflineBanner, ProgressBar, colors, palette } from "../../lib/ui";

export default function ClassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: cls, error, offline, cachedAt, refreshing, refresh } = useCached(`class:${id}`, () => api.classDetail(id), [id]);

  return (
    <>
      <Stack.Screen options={{ title: cls?.name ?? "Class" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {offline ? <OfflineBanner cachedAt={cachedAt} /> : null}
        {error ? <ErrorBox message={error} /> : null}
        {!cls && !error ? <Loading /> : null}
        {cls ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Muted>
              {cls.studentCount} student{cls.studentCount === 1 ? "" : "s"}
              {cls.academicYear ? `, ${cls.academicYear}` : ""}
            </Muted>
            <Button title="Grades and ranking" variant="secondary" style={{ minHeight: 38, paddingVertical: 8 }} onPress={() => router.push({ pathname: "/grades/[id]", params: { id: cls.id } })} />
          </View>
        ) : null}
        {cls && cls.subjects.length === 0 ? <Empty>No subjects have been added to this class yet.</Empty> : null}
        {cls?.subjects.map((s) => (
          <Card key={s.id} style={{ padding: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: palette.ink950, padding: 14, paddingBottom: 6, fontFamily: "serif" }}>{s.name}</Text>
            {s.lessons.length === 0 ? (
              <Muted style={{ padding: 14, paddingTop: 0 }}>No lessons yet.</Muted>
            ) : (
              s.lessons.map((l, i) => (
                <Pressable
                  key={l.id}
                  onPress={() => router.push({ pathname: "/lesson/[id]", params: { id: l.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${l.title}, ${l.confirmedCount} of ${cls.studentCount} confirmed`}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: pressed ? palette.paper : undefined })}
                >
                  <Text style={{ width: 20, color: colors.muted, fontFamily: "serif" }}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontWeight: "700", color: palette.ink950 }}>
                      {l.title}
                    </Text>
                    <Muted>
                      {l.viewedCount} viewed, {l.learntCount} learnt, {l.confirmedCount} confirmed of {cls.studentCount}
                    </Muted>
                    <View style={{ marginTop: 6 }}>
                      <ProgressBar value={cls.studentCount ? (l.confirmedCount / cls.studentCount) * 100 : 0} />
                    </View>
                  </View>
                  {l.fileCount === 0 ? <Badge tone="amber">No PDF</Badge> : l.published === false ? <Badge tone="amber">Draft</Badge> : null}
                </Pressable>
              ))
            )}
          </Card>
        ))}
      </ScrollView>
    </>
  );
}
