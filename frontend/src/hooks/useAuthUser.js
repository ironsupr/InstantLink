import { useQuery } from "@tanstack/react-query";
import { getAuthUser } from "../lib/api";
import { getCachedAuthUser } from "../lib/authCache";

const useAuthUser = () => {
  const cachedAuth = getCachedAuthUser();

  const authUser = useQuery({
    queryKey: ["authUser"],
    queryFn: getAuthUser,
    retry: false, // auth check
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialData: cachedAuth?.data,
    initialDataUpdatedAt: cachedAuth?.updatedAt,
  });

  return { isLoading: authUser.isLoading, authUser: authUser.data?.user };
};
export default useAuthUser;
