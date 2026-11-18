import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { api, type NotificationItem } from "../lib/api";
import { useCached } from "../lib/use-cached";
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
  // Same cached loader as the other screens: shows the last list offline and
  // keeps the fetch out of a setState-in-effect pattern.
  const { data, setData, error, refreshing, refresh, reload } = useCached("notifications", () => api.notifications());
  const items = data?.items ?? null;
  const unread = data?.unread ?? 0;

  const markAll = async () => {
    await api.markNotificationsRead().catch(() => {});
    void reload();
  };

  const open = async (n: NotificationItem) => {
    if (!n.readAt) {
      api.markNotificationsRead([n.id]).catch(() => {});
      setData((prev) => (prev ? { ...prev, unread: Math.max(0, prev.unread - 1), items: prev.items.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) } : prev));
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
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
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
