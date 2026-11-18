import { Platform } from "react-native";

/**
 * Base URL of the web server (the Next.js app in ../web).
 * Set EXPO_PUBLIC_API_URL in mobile/.env, e.g. http://192.168.1.20:3000 for a
 * phone on the same Wi-Fi, or https://app.yourdomain.com in production.
 * The Android emulator reaches the host machine at 10.0.2.2.
 */
function resolveApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (Platform.OS === "android") return "http://10.0.2.2:3000";
  return "http://localhost:3000";
}

export const API_URL = resolveApiUrl();
