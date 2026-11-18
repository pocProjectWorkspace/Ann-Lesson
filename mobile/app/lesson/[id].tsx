import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api, type StudentLesson, type TeacherLessonDetail } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useCached } from "../../lib/use-cached";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Muted, OfflineBanner, Subtitle, Title, colors, palette } from "../../lib/ui";

type Lesson = StudentLesson | TeacherLessonDetail;
const isStudentLesson = (l: Lesson): l is StudentLesson => "progress" in l;

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: lesson, setData: setLesson, error: loadError, offline, cachedAt, refreshing, refresh } = useCached<Lesson>(`lesson:${id}`, () => api.lesson(id), [id]);
  const [actionError, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const error = actionError ?? loadError;

  const toggleLearnt = async () => {
    if (!lesson || !isStudentLesson(lesson)) return;
    setSaving("learnt");
    setError(null);
    try {
      const progress = await api.setLearnt(lesson.id, !lesson.progress.learnt);
      setLesson({ ...lesson, progress });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const confirm = async (studentId: string, value: boolean) => {
    if (!lesson || isStudentLesson(lesson)) return;
    setSaving(studentId);
    try {
      const r = await api.confirmLearnt(lesson.id, studentId, value);
      setLesson({ ...lesson, students: lesson.students.map((s) => (s.id === studentId ? { ...s, learntAt: r.learntAt, confirmedAt: r.confirmedAt } : s)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const openBook = (fileId: string, fileName: string) => router.push({ pathname: "/viewer/[fileId]", params: { fileId, title: fileName } });

  return (
    <>
      <Stack.Screen options={{ title: lesson?.subject.name ?? "Lesson" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {offline ? <OfflineBanner cachedAt={cachedAt} /> : null}
        {error ? <ErrorBox message={error} /> : null}
        {!lesson && !error ? <Loading /> : null}
        {lesson ? (
          <>
            <View style={{ gap: 4 }}>
              <Title>{lesson.title}</Title>
              {lesson.description ? <Subtitle>{lesson.description}</Subtitle> : null}
              <Muted>
                {lesson.subject.name}, {lesson.class.name}
              </Muted>
            </View>

            {lesson.files.length === 0 ? (
              <Empty>No PDF has been uploaded for this lesson yet.</Empty>
            ) : (
              lesson.files.map((f) => (
                <Card key={f.id}>
                  <Text style={{ fontWeight: "700", color: palette.ink900 }} numberOfLines={1}>
                    {f.fileName}
                  </Text>
                  <Muted>{formatBytes(f.sizeBytes)}</Muted>
                  <Button title="Read as book" onPress={() => openBook(f.id, f.fileName)} />
                </Card>
              ))
            )}

            {isStudentLesson(lesson) ? (
              <Card>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "700", color: palette.ink900 }}>Your progress</Text>
                  {lesson.progress.confirmedAt ? <Badge tone="green">Confirmed by teacher</Badge> : lesson.progress.learnt ? <Badge tone="green">Learnt</Badge> : lesson.progress.viewed ? <Badge tone="accent">In progress</Badge> : <Badge>Not started</Badge>}
                </View>
                {lesson.progress.learntAt ? <Muted>Marked learnt on {formatDate(lesson.progress.learntAt)}</Muted> : null}
                {lesson.progress.confirmedAt ? (
                  <Muted>Your teacher confirmed this on {formatDate(lesson.progress.confirmedAt)}. It can no longer be undone.</Muted>
                ) : (
                  <Button title={lesson.progress.learnt ? "Undo mark as learnt" : "Mark as learnt"} variant={lesson.progress.learnt ? "secondary" : "primary"} onPress={toggleLearnt} loading={saving === "learnt"} />
                )}
                {!lesson.progress.viewed && !lesson.progress.learnt ? <Muted>Open the book first, then mark it as learnt.</Muted> : null}
              </Card>
            ) : (
              <Card style={{ padding: 0 }}>
                <View style={{ padding: 14, paddingBottom: 6 }}>
                  <Text style={{ fontWeight: "700", color: palette.ink900 }}>
                    Who has read it ({lesson.students.filter((s) => s.confirmedAt).length} confirmed, {lesson.students.filter((s) => s.learntAt).length} learnt of {lesson.students.length})
                  </Text>
                </View>
                {lesson.students.length === 0 ? (
                  <Muted style={{ padding: 14, paddingTop: 0 }}>No students in this class.</Muted>
                ) : (
                  lesson.students.map((s) => {
                    const state = s.confirmedAt ? "confirmed" : s.learntAt ? "learnt" : s.viewedAt ? "viewed" : "none";
                    return (
                      <View key={s.id} style={{ flexDirection: "row", alignItems: "center", padding: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: palette.borderSoft, gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: "700", color: palette.ink900 }}>{s.name}</Text>
                          <Muted>{s.viewedAt ? `Opened ${formatDate(s.viewedAt)}` : "Not opened"}</Muted>
                          <View style={{ marginTop: 4, flexDirection: "row" }}>
                            {state === "confirmed" && <Badge tone="green">Confirmed</Badge>}
                            {state === "learnt" && <Badge tone="accent">Says learnt</Badge>}
                            {state === "viewed" && <Badge>Viewed</Badge>}
                            {state === "none" && <Badge tone="amber">Not yet</Badge>}
                          </View>
                        </View>
                        <Button title={state === "confirmed" ? "Undo" : "Confirm"} variant="secondary" style={{ minHeight: 38, paddingVertical: 8 }} loading={saving === s.id} onPress={() => confirm(s.id, state !== "confirmed")} />
                      </View>
                    );
                  })
                )}
              </Card>
            )}

            {user?.role === "STUDENT" ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                {lesson.prevLessonId ? (
                  <Pressable onPress={() => router.replace({ pathname: "/lesson/[id]", params: { id: lesson.prevLessonId! } })}>
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>← Previous lesson</Text>
                  </Pressable>
                ) : (
                  <View />
                )}
                {lesson.nextLessonId ? (
                  <Pressable onPress={() => router.replace({ pathname: "/lesson/[id]", params: { id: lesson.nextLessonId! } })}>
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>Next lesson →</Text>
                  </Pressable>
                ) : (
                  <View />
                )}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}
