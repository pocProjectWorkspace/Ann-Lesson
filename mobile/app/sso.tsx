import { useEffect } from "react";
import { View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Loading } from "../lib/ui";

/**
 * Landing route for the single sign-on redirect. On the web build the provider popup
 * returns here, and completing the auth session hands the URL (with the token in its
 * fragment) back to the login screen, which then closes this window. On native the
 * in-app browser intercepts the redirect before any route renders.
 */
export default function SsoReturn() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Loading label="Finishing sign-in…" />
    </View>
  );
}
