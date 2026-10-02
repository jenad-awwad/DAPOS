import type { QueryClient } from "@tanstack/react-query";

export function invalidateDashboardQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dashboard-orders"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-revenue-orders"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard-item-sales"] }),
  ]);
}
