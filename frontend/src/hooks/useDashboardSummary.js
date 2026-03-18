import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary } from "../lib/api";
import { getCachedDashboardSummary } from "../lib/dashboardCache";
import useAuthUser from "./useAuthUser";

const useDashboardSummary = () => {
  const { authUser } = useAuthUser();
  const cachedDashboard = getCachedDashboardSummary();

  return useQuery({
    queryKey: ["dashboardSummary"],
    queryFn: getDashboardSummary,
    enabled: !!authUser?.organization,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    initialData: cachedDashboard?.data,
    initialDataUpdatedAt: cachedDashboard?.updatedAt,
  });
};

export default useDashboardSummary;
