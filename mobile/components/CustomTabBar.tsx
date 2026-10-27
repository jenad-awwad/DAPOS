import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

type CustomTabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  navigation: {
    emit: (event: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};

const TAB_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  index: { label: "Home", icon: "home" },
  pos: { label: "POS", icon: "cart" },
  products: { label: "Products", icon: "cube" },
  reports: { label: "Reports", icon: "bar-chart" },
};

export function CustomTabBar({ state, navigation }: CustomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          if (!TAB_META[route.name]) return null;
          const focused = state.index === index;
          const meta = TAB_META[route.name];
          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable key={route.key} style={styles.tab} onPress={onPress}>
              <Ionicons
                name={focused ? meta.icon : (`${meta.icon}-outline` as keyof typeof Ionicons.glyphMap)}
                size={22}
                color={focused ? colors.primary : colors.textLight}
              />
              <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={styles.fab}
        onPress={() => router.push("/calendar")}
      >
        <Ionicons name="calendar" size={26} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingHorizontal: 12,
    position: "relative",
  },
  bar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    minHeight: 56,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 64,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textLight,
  },
  tabLabelActive: {
    color: colors.primary,
  },
  fab: {
    position: "absolute",
    alignSelf: "center",
    top: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
