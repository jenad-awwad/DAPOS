import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useModulesMenu } from "../context/ModulesMenuContext";
import { colors, roleLabel } from "../lib/theme";

type Props = {
  showMenu?: boolean;
};

export function AppHeader({ showMenu = true }: Props) {
  const { user, store } = useAuth();
  const { open } = useModulesMenu();
  const initials = user?.name
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.row}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials ?? "?"}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.name}>{user?.name ?? "User"}</Text>
          <View style={styles.subRow}>
            <Text style={styles.role}>
              {roleLabel(user?.role)} • {store?.name ?? "Store"}
            </Text>
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          </View>
        </View>
      </View>
      {showMenu ? (
        <Pressable style={styles.menuButton} onPress={open} hitSlop={8}>
          <Ionicons name="menu" size={22} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 16,
  },
  meta: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  subRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  role: {
    color: colors.textMuted,
    fontSize: 12,
  },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: colors.pill,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  onlineText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "700",
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
