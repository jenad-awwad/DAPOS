import { Stack } from "expo-router";

export default function PosLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: "#f8fafc",
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: "#0f172a" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "DAPOS" }} />
      <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
    </Stack>
  );
}
