import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Small storage layer.
 * - secure*: the session token. Keychain / Keystore on devices, localStorage on web
 *   (web builds are for development and demos; the browser has no secure store).
 * - cache*: last-known API payloads so screens still render offline.
 */
const isWeb = Platform.OS === "web";

export async function secureGet(key: string) {
  if (isWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}
export async function secureSet(key: string, value: string) {
  if (isWeb) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
export async function secureDelete(key: string) {
  if (isWeb) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

const CACHE_PREFIX = "lp.cache.";

export async function cacheSet(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* ignore */
  }
}
export async function cacheGet<T>(key: string): Promise<{ at: number; value: T } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as { at: number; value: T }) : null;
  } catch {
    return null;
  }
}
export async function cacheClear() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE_PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    /* ignore */
  }
}
