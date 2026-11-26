import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { api, type LiveState } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCached } from "../lib/use-cached";
import { Card, Empty, ErrorBox, Loading, Muted, OfflineBanner, ProgressBar, SpineCard, Subtitle, Title, colors, palette, setAccent } from "../lib/ui";

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
          <Subtitle>{home?.role === "STUDENT" ? home.class?.name ?? "No class assigned yet" : home?.role === "PARENT" ? "Family" : "Your classes"}</Subtitle>
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

        {home?.role === "STUDENT" && home.class ? <LiveJoinCard classId={home.class.id} /> : null}
        {home?.role === "STUDENT" && home.stickers ? (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: palette.ink950, fontFamily: "serif" }}>My stickers</Text>
              <Text style={{ color: home.stickers.streak.current ? "#9a3412" : colors.muted, fontWeight: "600", fontSize: 13 }}>
                {home.stickers.streak.current ? `🔥 ${home.stickers.streak.current} day${home.stickers.streak.current === 1 ? "" : "s"} in a row${home.stickers.streak.readToday ? "" : " · read today to keep it"}` : "Read today to start a streak"}
              </Text>
            </View>
            {home.stickers.stickers.length === 0 ? (
              <Muted>Your shelf is empty. Finish a book to earn your first sticker.</Muted>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {home.stickers.stickers.slice(0, 12).map((s) => (
                  <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: "#fde68a", backgroundColor: "#fffbeb", paddingVertical: 4, paddingLeft: 6, paddingRight: 10 }} accessibilityLabel={`${s.label}${s.note ? ", " + s.note : ""}${s.givenBy ? ", from " + s.givenBy : ""}`}>
                    <Text style={{ fontSize: 18 }}>{s.emoji}</Text>
                    <View>
                      <Text style={{ fontWeight: "700", color: palette.ink900, fontSize: 13 }}>{s.label}</Text>
                      {s.note || s.givenBy ? <Text style={{ color: colors.muted, fontSize: 11 }}>{s.note ? s.note : `from ${s.givenBy}`}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
            {home.stickers.next ? (
              <Muted>
                Next up {home.stickers.next.emoji} {home.stickers.next.label}: {home.stickers.next.have} of {home.stickers.next.need} {home.stickers.next.unit}
                {home.stickers.next.need === 1 ? "" : "s"}
              </Muted>
            ) : null}
          </Card>
        ) : null}
        {home?.role === "STUDENT" && home.grades && home.grades.subjects.some((s) => s.rating) ? (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: palette.ink950, fontFamily: "serif" }}>My grades</Text>
              <Muted>
                Overall {home.grades.overall}%{home.grades.rank ? ` · rank ${home.grades.rank} of ${home.grades.gradedStudents}` : ""}
              </Muted>
            </View>
            {home.grades.subjects.map((g) => (
              <View key={g.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
                <Text style={{ fontWeight: "600", color: palette.ink900 }}>{g.name}</Text>
                <Text style={{ color: colors.muted }} accessibilityLabel={`${g.name}: ${g.label}`}>
                  <Text style={{ color: colors.primary }}>{g.rating ? "★".repeat(g.rating) + "☆".repeat(5 - g.rating) : "☆☆☆☆☆"}</Text> {g.label}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
        {home?.role === "STUDENT" &&
          (home.subjects.length === 0 ? (
            <Empty>{home.class ? "No lessons have been published for your class yet." : "You have not been placed in a class yet. Ask your school admin."}</Empty>
          ) : (
            home.subjects.map((s, i) => {
              const pct = s.readPercent ?? (s.lessonCount ? Math.round((s.learntCount / s.lessonCount) * 100) : 0);
              return (
                <Pressable key={s.id} onPress={() => router.push({ pathname: "/subject/[id]", params: { id: s.id } })} accessibilityRole="button" accessibilityLabel={`${s.name}, ${s.learntCount} of ${s.lessonCount} lessons learnt`}>
                  <SpineCard index={i}>
                    <Text style={{ fontSize: 20, fontWeight: "700", color: palette.ink950, fontFamily: "serif" }}>{s.name}</Text>
                    <Muted>{s.lessonCount === 0 ? "No lessons yet" : s.learntCount === s.lessonCount ? "All lessons learnt" : `${s.learntCount} of ${s.lessonCount} lesson${s.lessonCount === 1 ? "" : "s"} learnt, ${pct}% read`}</Muted>
                    <View style={{ marginTop: 6 }}>
                      <ProgressBar value={pct} />
                    </View>
                  </SpineCard>
                </Pressable>
              );
            })
          ))}

        {home?.role === "PARENT" &&
          (home.children.length === 0 ? (
            <Empty>Your school has not linked a child to your account yet. Ask the school office.</Empty>
          ) : (
            home.children.map((c, i) => (
              <SpineCard key={c.id} index={i}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: palette.ink950, fontFamily: "serif" }}>{c.name}</Text>
                <Muted>
                  {c.className ?? "No class yet"}
                  {c.teachers.length ? ` · ${c.teachers.join(", ")}` : ""}
                </Muted>
                <Text style={{ marginTop: 6, color: c.streak.current ? "#9a3412" : colors.muted, fontWeight: "600", fontSize: 13 }}>{c.streak.current ? `🔥 ${c.streak.current} day${c.streak.current === 1 ? "" : "s"} in a row${c.streak.readToday ? "" : " · not read today yet"}` : "No streak this week. One page tonight starts one."}</Text>
                <View style={{ flexDirection: "row", gap: 20, marginTop: 8 }}>
                  <Stat label="Days this week" value={c.week.days} />
                  <Stat label="Pages" value={c.week.pages} />
                  <Stat label="Books" value={`${c.books.finished}/${c.books.total}`} />
                </View>
                {c.tonight ? (
                  <Pressable onPress={() => c.tonight?.fileId && router.push({ pathname: "/viewer/[fileId]", params: { fileId: c.tonight.fileId, title: c.tonight.title } })} accessibilityRole="button" accessibilityLabel={`Read ${c.tonight.title} together`} style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.primary + "55", backgroundColor: colors.primarySoft + "99", padding: 12 }}>
                    <Text style={{ fontSize: 22 }}>📖</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{c.tonight.again ? "Read again together tonight" : "Read together tonight"}</Text>
                      <Text style={{ color: palette.ink950, fontWeight: "700", fontFamily: "serif", fontSize: 16 }} numberOfLines={1}>
                        {c.tonight.title}
                      </Text>
                      <Muted>
                        {c.tonight.again ? "Every book finished; favourites are worth a second read" : c.tonight.started && c.tonight.pageCount ? `${c.firstName} is on page ${Math.max(1, c.tonight.lastPage)} of ${c.tonight.pageCount}` : "Not started yet"}
                        {c.tonight.readToMe ? " · teacher reads aloud" : ""}
                      </Muted>
                    </View>
                  </Pressable>
                ) : null}
                {c.stickers.length > 0 ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {c.stickers.map((s) => (
                      <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: "#fde68a", backgroundColor: "#fffbeb", paddingVertical: 4, paddingLeft: 6, paddingRight: 10 }} accessibilityLabel={`${s.label}${s.note ? ", " + s.note : ""}`}>
                        <Text style={{ fontSize: 16 }}>{s.emoji}</Text>
                        <Text style={{ fontWeight: "700", color: palette.ink900, fontSize: 12 }}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {c.grades && c.grades.subjects.some((g) => g.rating) ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ fontWeight: "700", color: palette.ink950, fontSize: 13 }}>Teacher&apos;s stars{c.grades.rank ? ` · rank ${c.grades.rank} of ${c.grades.classSize}` : ""}</Text>
                    {c.grades.subjects.filter((g) => g.rating).map((g) => (
                      <View key={g.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
                        <Text style={{ color: palette.ink900 }}>{g.name}</Text>
                        <Text style={{ color: colors.muted }}>
                          <Text style={{ color: colors.primary }}>{"★".repeat(g.rating ?? 0) + "☆".repeat(5 - (g.rating ?? 0))}</Text> {g.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </SpineCard>
            ))
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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View>
      <Muted>{label}</Muted>
      <Text style={{ fontWeight: "700", color: palette.ink950, fontSize: 18, fontFamily: "serif" }}>{value}</Text>
    </View>
  );
}

/** Student: while the class board is on, offer to open the book the teacher is showing. */
function LiveJoinCard({ classId }: { classId: string }) {
  const router = useRouter();
  const [state, setState] = useState<LiveState>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = () => api.liveState(classId).then((r) => !cancelled && setState(r.state)).catch(() => {});
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [classId]);
  if (!state) return null;
  return (
    <Pressable onPress={() => router.push({ pathname: "/viewer/[fileId]", params: { fileId: state.fileId, title: "Class book" } })} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: "#dcf3e6", borderWidth: 1, borderColor: "#1f7a4d55" }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#1f7a4d", alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff" }} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "700", color: "#1f7a4d", fontSize: 13 }}>Your teacher&apos;s board is on</Text>
        <Text style={{ fontWeight: "700", color: palette.ink950, fontSize: 16, fontFamily: "serif" }}>{state.follow ? "Join the class and follow along" : "Open the book your teacher is showing"}</Text>
      </View>
    </Pressable>
  );
}
