import { Platform } from "react-native";
import { api } from "./api";

/**
 * Register this device for push notifications. Safe to call on every sign-in:
 * no-op on web, in Expo Go without a project id, or when permission is denied.
 * Returns the token when registered so sign-out can remove it.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const Device = await import("expo-device");
    if (!Device.isDevice) return null;
    const Notifications = await import("expo-notifications");
    const Constants = (await import("expo-constants")).default;
    const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null; // configured by `eas init`; without it Expo cannot issue tokens

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "Lesson updates", importance: Notifications.AndroidImportance.DEFAULT });
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api.registerPushToken(token, Platform.OS === "ios" ? "ios" : "android");
    return token;
  } catch {
    return null;
  }
}

export async function unregisterPush(token: string | null) {
  if (!token) return;
  await api.removePushToken(token).catch(() => {});
}
