import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ModulesMenu } from "../components/ModulesMenu";
import { AuthProvider } from "../context/AuthContext";
import { CartProvider } from "../context/CartContext";
import { ModulesMenuProvider } from "../context/ModulesMenuContext";

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <CartProvider>
            <ModulesMenuProvider>
              <StatusBar style="dark" />
              <ModulesMenu />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(inventory)" />
              <Stack.Screen name="calendar" />
              <Stack.Screen name="new-project" />
              <Stack.Screen name="project/[id]" />
              <Stack.Screen name="vendors" />
              </Stack>
            </ModulesMenuProvider>
          </CartProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
