import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../lib/auth";
import { colors } from "../lib/ui";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700" },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="home" options={{ title: "Lesson Plan" }} />
          <Stack.Screen name="subject/[id]" options={{ title: "Subject" }} />
          <Stack.Screen name="class/[id]" options={{ title: "Class" }} />
          <Stack.Screen name="grades/[id]" options={{ title: "Grades" }} />
          <Stack.Screen name="remote/[id]" options={{ title: "Board remote" }} />
          <Stack.Screen name="lesson/[id]" options={{ title: "Lesson" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="viewer/[fileId]" options={{ title: "Book", presentation: "fullScreenModal" }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
