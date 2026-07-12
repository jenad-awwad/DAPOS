import { useAuth } from "../context/AuthContext";

export function useCanManage() {
  const { user } = useAuth();
  return user?.role === "ADMIN" || user?.role === "MANAGER";
}

export function useIsAdmin() {
  const { user } = useAuth();
  return user?.role === "ADMIN";
}
