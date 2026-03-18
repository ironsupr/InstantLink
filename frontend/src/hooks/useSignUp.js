import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signup } from "../lib/api";
import { setCachedAuthUser } from "../lib/authCache";

const useSignUp = () => {
  const queryClient = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: signup,
    onSuccess: (data) => {
      setCachedAuthUser(data);
      queryClient.setQueryData(["authUser"], data);
    },
  });

  return { isPending, error, signupMutation: mutate };
};
export default useSignUp;
