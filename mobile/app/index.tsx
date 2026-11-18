import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth";
import { Loading } from "../lib/ui";
import { View } from "react-native";

export default function Index() {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Loading label="Starting…" />
      </View>
    );
  }
  return <Redirect href={user ? "/home" : "/login"} />;
}
