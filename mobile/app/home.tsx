import { useCallback, useEffect } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCached } from "../lib/use-cached";
import { Empty, ErrorBox, Loading, Muted, OfflineBanner, ProgressBar, SpineCard, Subtitle, Title, colors, palette, setAccent } from "../lib/ui";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function HomeScreen() {
  const { ready, user, signOut } = useAuth();
  const router = useRouter();
  setAccent(user?.role);
  const { data, error, offline, cachedAt, refreshing, refresh, reload } = useCached(
    "home",
    async () => {
      const [home, n] = await Promise.all([api.home(), api.notifications().catch(() => ({ unread: 0 }))]);
      return { home, unread: n.unread };
    },
    [],
    { enabled: ready && !!user },
  );
  const home = data?.home;
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useFocusEffect(
    useCallback(() => {
      if (ready && user) void reload();
    }, [ready, user, reload]),
  );

  const confirmSignOut = () =>
    Alert.alert("Sign out", "Sign out of Lesson Plan?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: async () => { await signOut(); router.replace("/login"); } },
    ]);

  const firstName = user?.name.split(" ")[0] ?? "";
  const continueLesson = home?.role === "STUDENT" && home.continueLessonId ? home.subjects.flatMap((s) => s.lessons).find((l) => l.id === home.continueLessonId) : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          title: user?.school?.name ?? "Lesson Plan",
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Pressable onPress={() => router.push("/notifications")} hitSlop={10} accessibilityRole="button" accessibilityLabel={unread ? `${unread} unread notifications` : "Notifications"}>
                <View>
                  <Text style={{ fontSize: 20 }}>🔔</Text>
                  {unread > 0 && (
                    <View style={{ position: "absolute", top: -4, right: -8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{unread > 99 ? "99+" : unread}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
              <Pressable onPress={confirmSignOut} hitSlop={10} accessibilityRole="button">
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Sign out</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {offline ? <OfflineBanner cachedAt={cachedAt} /> : null}
        <View style={{ marginBottom: 4 }}>
          <Subtitle>{home?.role === "STUDENT" ? home.class?.name ?? "No class assigned yet" : "Your classes"}</Subtitle>
          <Title>
            {greeting()}, {firstName}
          </Title>
        </View>
        {error ? <ErrorBox message={error} /> : null}
        {!home && !error ? <Loading /> : null}

        {continueLesson ? (
          <Pressable onPress={() => router.push({ pathname: "/lesson/[id]", params: { id: continueLesson.id } })} accessibilityRole="button" accessibilityLabel={`Continue reading ${continueLesson.title}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.primary + "55", backgroundColor: colors.primarySoft + "99", padding: 14 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontSize: 16 }}>▶</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>Continue reading</Text>
                <Text style={{ color: palette.ink950, fontWeight: "700", fontFamily: "serif", fontSize: 16 }} numberOfLines={1}>
                  {continueLesson.title}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {home?.role === "STUDENT" &&
          (home.subjects.length === 0 ? (
            <Empty>{home.class ? "No lessons have been published for your class yet." : "You have not been placed in a class yet. Ask your school admin."}</Empty>
          ) : (
            home.subjects.map((s, i) => {
              const pct = s.lessonCount ? Math.round((s.learntCount / s.lessonCount) * 100) : 0;
              return (
                <Pressable key={s.id} onPress={() => router.push({ pathname: "/subject/[id]", params: { id: s.id } })} accessibilityRole="button" accessibilityLabel={`${s.name}, ${s.learntCount} of ${s.lessonCount} lessons learnt`}>
                  <SpineCard index={i}>
                    <Text style={{ fontSize: 20, fontWeight: "700", color: palette.ink950, fontFamily: "serif" }}>{s.name}</Text>
                    <Muted>{s.lessonCount === 0 ? "No lessons yet" : s.learntCount === s.lessonCount ? "All lessons learnt" : `${s.learntCount} of ${s.lessonCount} lesson${s.lessonCount === 1 ? "" : "s"} learnt`}</Muted>
                    <View style={{ marginTop: 6 }}>
                      <ProgressBar value={pct} />
                    </View>
                  </SpineCard>
                </Pressable>
              );
            })
          ))}

        {home?.role === "TEACHER" &&
          (home.classes.length === 0 ? (
            <Empty>You have not been assigned to any class yet. Ask your school admin.</Empty>
          ) : (
            home.classes.map((c, i) => (
              <Pressable key={c.id} onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.id } })} accessibilityRole="button" accessibilityLabel={`${c.name}, ${c.studentCount} students`}>
                <SpineCard index={i}>
                  <Text style={{ fontSize: 20, fontWeight: "700", color: palette.ink950, fontFamily: "serif" }}>{c.name}</Text>
                  {c.academicYear ? <Muted>{c.academicYear}</Muted> : null}
                  <View style={{ flexDirection: "row", gap: 20, marginTop: 6 }}>
                    <Stat label="Subjects" value={c.subjectCount} />
                    <Stat label="Lessons" value={c.lessonCount} />
                    <Stat label="Students" value={c.studentCount} />
                  </View>
                  <Muted style={{ marginTop: 6 }}>{c.lessonCount && c.studentCount ? `${c.learntPercent}% of lessons learnt across the class` : "No progress yet"}</Muted>
                </SpineCard>
              </Pressable>
            ))
          ))}
      </ScrollView>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Muted>{label}</Muted>
      <Text style={{ fontWeight: "700", color: palette.ink950, fontSize: 18, fontFamily: "serif" }}>{value}</Text>
    </View>
  );
}
