import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { api, type NotificationItem } from "../lib/api";
import { Card, Empty, ErrorBox, Loading, Muted, colors, palette } from "../lib/ui";

function when(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Map a web href from a notification to the matching app screen. */
function routeFor(href: string | null): { pathname: "/lesson/[id]" | "/class/[id]" | "/home"; params?: Record<string, string> } | null {
  if (!href) return null;
  const lesson = href.match(/\/lessons\/([0-9a-f-]{36})/);
  if (lesson) return { pathname: "/lesson/[id]", params: { id: lesson[1] } };
  const cls = href.match(/\/teacher\/classes\/([0-9a-f-]{36})/);
  if (cls) return { pathname: "/class/[id]", params: { id: cls[1] } };
  return { pathname: "/home" };
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await api.notifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markAll = async () => {
    await api.markNotificationsRead().catch(() => {});
    void load();
  };

  const open = async (n: NotificationItem) => {
    if (!n.readAt) {
      api.markNotificationsRead([n.id]).catch(() => {});
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? null);
      setUnread((u) => Math.max(0, u - 1));
    }
    const r = routeFor(n.href);
    if (r) router.push(r as never);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Notifications",
          headerRight: () =>
            unread > 0 ? (
              <Pressable onPress={markAll} hitSlop={10}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Mark all read</Text>
              </Pressable>
            ) : null,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
        {error ? <ErrorBox message={error} /> : null}
        {!items && !error ? <Loading /> : null}
        {items && items.length === 0 ? <Empty>Nothing yet. You will be told here when new lessons are published or your class changes.</Empty> : null}
        {items && items.length > 0 ? (
          <Card style={{ padding: 0 }}>
            {items.map((n, i) => (
              <Pressable
                key={n.id}
                onPress={() => open(n)}
                style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: palette.borderSoft, backgroundColor: pressed ? palette.paper : n.readAt ? undefined : colors.primarySoft + "66" })}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: n.readAt ? "transparent" : colors.primary }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: palette.ink900, fontSize: 15 }}>{n.title}</Text>
                  {n.body ? <Muted style={{ marginTop: 2 }}>{n.body}</Muted> : null}
                  <Muted style={{ marginTop: 4, color: palette.ink400 }}>{when(n.createdAt)}</Muted>
                </View>
              </Pressable>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </>
  );
}
