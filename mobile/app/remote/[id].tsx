import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { api, type LivePresence, type LiveState } from "../../lib/api";
import { useCached } from "../../lib/use-cached";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Muted, colors, palette } from "../../lib/ui";

/**
 * Teacher's phone remote for the smart board. Polls the room every two seconds (React
 * Native has no EventSource) and sends page, follow, pick and close commands.
 */
export default function RemoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: cls, error: loadError } = useCached(`class:${id}`, () => api.classDetail(id), [id]);
  const [state, setState] = useState<LiveState>(null);
  const [people, setPeople] = useState<LivePresence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.liveState(id);
      setState(r.state);
      setPeople(r.people);
    } catch {
      /* keep the last known state */
    }
  }, [id]);
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 2000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  const act = async (command: Record<string, unknown>) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const r = await api.liveCommand(id, command);
      if (r.state !== undefined) setState(r.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the board");
    } finally {
      busy.current = false;
    }
  };

  const lessons = cls?.subjects.flatMap((s) => s.lessons.filter((l) => l.fileCount > 0).map((l) => ({ id: l.id, title: `${s.name}: ${l.title}` }))) ?? [];
  const current = state ? lessons.find((l) => l.id === state.lessonId) : null;
  const students = people.filter((p) => p.role === "STUDENT");

  return (
    <>
      <Stack.Screen options={{ title: cls ? `${cls.name}: remote` : "Board remote" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {loadError ? <ErrorBox message={loadError} /> : null}
        {error ? <ErrorBox message={error} /> : null}
        {!cls && !loadError ? <Loading /> : null}

        {cls && !state ? (
          <Card>
            <Text style={{ fontSize: 18, fontWeight: "700", color: palette.ink950, fontFamily: "serif" }}>Open a book on the board</Text>
            <Muted>Open the lesson on the classroom board first; it appears here the moment it is open. Or start it from here and the board picks it up.</Muted>
            {lessons.length === 0 ? <Empty>No lessons with a PDF in this class yet.</Empty> : null}
            {lessons.map((l) => (
              <Button key={l.id} title={l.title} variant="secondary" onPress={() => act({ type: "open", lessonId: l.id })} />
            ))}
          </Card>
        ) : null}

        {state ? (
          <>
            <Card>
              <Text numberOfLines={1} style={{ fontWeight: "700", color: palette.ink950 }}>
                {current?.title ?? "Book on the board"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 }}>
                <Pressable onPress={() => act({ type: "page", page: Math.max(1, state.page - 1) })} accessibilityRole="button" accessibilityLabel="Previous page" style={{ flex: 1, height: 84, borderRadius: 18, backgroundColor: palette.ink950, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 36 }}>‹</Text>
                </Pressable>
                <View style={{ alignItems: "center", minWidth: 64 }}>
                  <Text style={{ fontSize: 40, fontWeight: "700", color: palette.ink950, fontFamily: "serif" }}>{state.page}</Text>
                  <Muted>page</Muted>
                </View>
                <Pressable onPress={() => act({ type: "page", page: state.page + 1 })} accessibilityRole="button" accessibilityLabel="Next page" style={{ flex: 1, height: 84, borderRadius: 18, backgroundColor: palette.ink950, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 36 }}>›</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Button title={state.follow ? "Following · release" : "Students follow"} variant={state.follow ? "primary" : "secondary"} style={{ flex: 1 }} onPress={() => act({ type: "follow", on: !state.follow })} />
                <Button
                  title={picked ? `Picked: ${picked}` : "Pick a child"}
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    try {
                      const r = (await api.liveCommand(id, { type: "pick" })) as { name?: string };
                      if (r.name) setPicked(r.name);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not pick");
                    }
                  }}
                />
              </View>
              <Button title="Close the board" variant="secondary" style={{ marginTop: 8 }} onPress={() => act({ type: "close" })} />
            </Card>
            <Card>
              <Text style={{ fontWeight: "700", color: palette.ink950 }}>In the room</Text>
              <Muted>
                {students.length} student{students.length === 1 ? "" : "s"} connected{state.follow ? `, following page ${state.page}` : ""}
              </Muted>
              {students.map((p) => (
                <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ color: palette.ink900 }}>{p.name}</Text>
                  <Badge tone={p.page === state.page ? "green" : "slate"}>{p.page ? `p.${p.page}` : "–"}</Badge>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}
