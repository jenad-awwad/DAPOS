import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader, Center } from "@mantine/core";

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Center h="100vh">
        <Loader color="green" size="lg" />
      </Center>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}

export function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Center h="100vh">
        <Loader color="green" size="lg" />
      </Center>
    );
  }

  if (user) return <Navigate to="/" replace />;

  return <Outlet />;
}
