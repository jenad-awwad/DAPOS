import { Stack } from "expo-router";

export default function PosStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#FFFFFF" },
        headerTintColor: "#1E293B",
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: "#F4F5F9" },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "POS", headerShown: false }} />
      <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
    </Stack>
  );
}
