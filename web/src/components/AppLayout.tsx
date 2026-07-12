import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Burger,
  Group,
  NavLink,
  ScrollArea,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBox,
  IconCalendar,
  IconCategory,
  IconChartBar,
  IconLayoutDashboard,
  IconLogout,
  IconPackage,
  IconReceipt,
  IconSettings,
  IconShoppingCart,
  IconUsers,
  IconHistory,
} from "@tabler/icons-react";
import { NavLink as RouterNavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useCanManage, useIsAdmin } from "../hooks/useRoles";
import { roleLabel } from "../lib/format";

const mainLinks = [
  { to: "/", label: "Dashboard", icon: IconLayoutDashboard },
  { to: "/pos", label: "Point of Sale", icon: IconShoppingCart },
  { to: "/calendar", label: "Calendar", icon: IconCalendar },
  { to: "/orders", label: "Orders", icon: IconReceipt },
  { to: "/inventory", label: "Inventory", icon: IconBox },
];

const manageLinks = [
  { to: "/admin/products", label: "Products", icon: IconPackage },
  { to: "/admin/categories", label: "Categories", icon: IconCategory },
  { to: "/customers", label: "Customers", icon: IconUsers },
  { to: "/stock", label: "Stock history", icon: IconHistory },
];

const adminLinks = [
  { to: "/admin/staff", label: "Staff", icon: IconUsers },
  { to: "/settings", label: "Settings", icon: IconSettings },
];

export function AppLayout() {
  const [opened, { toggle }] = useDisclosure();
  const { user, store, signOut } = useAuth();
  const { itemCount } = useCart();
  const canManage = useCanManage();
  const isAdmin = useIsAdmin();
  const location = useLocation();
  const navigate = useNavigate();

  const sidebarLinks = [
    ...mainLinks,
    ...(canManage ? manageLinks : []),
    ...(isAdmin ? adminLinks : [{ to: "/settings", label: "Settings", icon: IconSettings }]),
  ];

  return (
    <Box style={{ display: "flex", minHeight: "100vh" }}>
      <Box
        component="aside"
        visibleFrom="sm"
        w={260}
        p="md"
        style={{
          borderRight: "1px solid var(--mantine-color-gray-2)",
          background: "var(--mantine-color-gray-0)",
        }}
      >
        <SidebarContent
          user={user!}
          store={store!}
          itemCount={itemCount}
          pathname={location.pathname}
          links={sidebarLinks}
          onSignOut={() => {
            signOut();
            navigate("/login");
          }}
        />
      </Box>

      <Box
        component="aside"
        hiddenFrom="sm"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          pointerEvents: opened ? "auto" : "none",
        }}
      >
        <Box
          onClick={toggle}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            opacity: opened ? 1 : 0,
            transition: "opacity 150ms ease",
          }}
        />
        <Box
          w={280}
          h="100%"
          p="md"
          style={{
            position: "relative",
            background: "white",
            transform: opened ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 150ms ease",
          }}
        >
          <SidebarContent
            user={user!}
            store={store!}
            itemCount={itemCount}
            pathname={location.pathname}
            links={sidebarLinks}
            onNavigate={toggle}
            onSignOut={() => {
              signOut();
              navigate("/login");
            }}
          />
        </Box>
      </Box>

      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group
          h={60}
          px="md"
          justify="space-between"
          style={{
            borderBottom: "1px solid var(--mantine-color-gray-2)",
            background: "white",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Group gap="xs">
              <ThemeIcon color="green" variant="light" size="lg" radius="md">
                <IconChartBar size={18} />
              </ThemeIcon>
              <div>
                <Text fw={700}>DAPOS</Text>
                <Text size="xs" c="dimmed">
                  {store?.name}
                </Text>
              </div>
            </Group>
          </Group>
          <Group gap="sm">
            {itemCount > 0 ? (
              <Badge color="green" variant="light" size="lg">
                Cart: {itemCount}
              </Badge>
            ) : null}
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {user?.name}
            </Text>
          </Group>
        </Group>
        <Box p={{ base: "md", sm: "lg" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

function SidebarContent({
  user,
  store,
  itemCount,
  pathname,
  links,
  onSignOut,
  onNavigate,
}: {
  user: { name: string; role: string };
  store: { name: string; currency: string };
  itemCount: number;
  pathname: string;
  links: { to: string; label: string; icon: typeof IconLayoutDashboard }[];
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <Group mb="xl">
        <Avatar color="green" radius="xl">
          {user.name.charAt(0)}
        </Avatar>
        <div>
          <Text fw={600} size="sm">
            {user.name}
          </Text>
          <Text size="xs" c="dimmed">
            {roleLabel(user.role)} · {store.currency}
          </Text>
        </div>
      </Group>

      <ScrollArea flex={1}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            component={RouterNavLink}
            to={link.to}
            end={link.to === "/"}
            label={link.label}
            leftSection={<link.icon size={18} stroke={1.5} />}
            rightSection={
              link.to === "/pos" && itemCount > 0 ? (
                <Badge size="sm" circle color="green">
                  {itemCount}
                </Badge>
              ) : undefined
            }
            active={link.to === "/" ? pathname === "/" : pathname.startsWith(link.to)}
            onClick={onNavigate}
            mb={4}
            variant="light"
            color="green"
          />
        ))}
      </ScrollArea>

      <ActionIcon
        variant="subtle"
        color="gray"
        size="lg"
        onClick={onSignOut}
        aria-label="Sign out"
        mt="md"
      >
        <IconLogout size={18} />
      </ActionIcon>
    </>
  );
}
