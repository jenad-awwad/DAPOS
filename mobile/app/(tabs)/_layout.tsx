import { Tabs } from "expo-router";

import { CustomTabBar } from "../../components/CustomTabBar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="pos" />
      <Tabs.Screen name="products" />
      <Tabs.Screen name="reports" />
    </Tabs>
  );
}
