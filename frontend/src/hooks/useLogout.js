import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "../lib/api";
import { StreamChat } from "stream-chat";
import { clearCachedAuthUser } from "../lib/authCache";
import { clearCachedDashboardSummary } from "../lib/dashboardCache";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const useLogout = () => {
  const queryClient = useQueryClient();

  const {
    mutate: logoutMutation,
    isPending,
    error,
  } = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      // Disconnect the Stream singleton so it doesn't carry stale tokens
      // into the next login session.
      try {
        const client = StreamChat.getInstance(STREAM_API_KEY);
        if (client.userID) await client.disconnectUser();
      } catch (_) {}
      clearCachedAuthUser();
      clearCachedDashboardSummary();
      queryClient.clear();
    },
  });

  return { logoutMutation, isPending, error };
};
export default useLogout;
