import { useMutation, useQueryClient } from "@tanstack/react-query";
import { login } from "../lib/api";
import { setCachedAuthUser } from "../lib/authCache";

const useLogin = () => {
  const queryClient = useQueryClient();
  const { mutate, isPending, error } = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setCachedAuthUser(data);
      queryClient.setQueryData(["authUser"], data);
    },
  });

  return { error, isPending, loginMutation: mutate };
};

export default useLogin;
