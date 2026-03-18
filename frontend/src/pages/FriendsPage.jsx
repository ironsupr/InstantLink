import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrgMembers, getUserFriends, lookupUserById, sendFriendRequest } from "../lib/api";
import FriendCard from "../components/FriendCard";
import NoFriendsFound from "../components/NoFriendsFound";
import { UsersIcon, SearchIcon, UserPlusIcon, CheckCircleIcon, HashIcon, HeartIcon, Building2Icon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Avatar from "../components/Avatar";
import { useStreamContext } from "../context/StreamContext";
import useAuthUser from "../hooks/useAuthUser";

const FriendsPage = () => {
  const { authUser } = useAuthUser();
  const [search, setSearch] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const queryClient = useQueryClient();
  const { refreshUserPresence } = useStreamContext();

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["orgMembers"],
    queryFn:  getOrgMembers,
  });

  const { data: myFriends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });

  const friendIds = new Set(myFriends.map((friend) => friend._id));
  const teamMembers = (membersData?.members ?? []).filter((member) => !friendIds.has(member._id));

  const { mutate: findUserById, isPending: isLookingUp } = useMutation({
    mutationFn: lookupUserById,
    onSuccess: (data) => {
      setLookupResult(data);
      toast.success("User found");
    },
    onError: (error) => {
      setLookupResult(null);
      toast.error(error.response?.data?.message || "Could not find that user");
    },
  });

  const { mutate: sendRequest, isPending: isSendingRequest } = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => {
      toast.success("Friend request sent");
      queryClient.invalidateQueries({ queryKey: ["outgoingFriendReqs"] });
      setLookupResult((prev) => prev
        ? {
            ...prev,
            existingRequest: {
              sender: "self",
              recipient: prev.user?._id,
              status: "pending",
            },
          }
        : prev);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || "Could not send request");
    },
  });

  const handleLookup = () => {
    const trimmed = lookupId.trim().toUpperCase();
    if (!trimmed) return toast.error("Enter a user ID");
    findUserById(trimmed);
  };

  const handleCopyMyUserId = async () => {
    const myCode = authUser?.userCode;
    if (!myCode) return toast.error("Set your User ID in Profile first");
    try {
      await navigator.clipboard.writeText(myCode);
      toast.success("Your User ID copied");
    } catch {
      toast.error("Could not copy User ID");
    }
  };

  const filterPeople = (people) => people.filter((person) =>
    person.fullName.toLowerCase().includes(search.toLowerCase()) ||
    (person.nativeLanguage || "").toLowerCase().includes(search.toLowerCase()) ||
    (person.learningLanguage || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredFriends = filterPeople(myFriends);
  const filteredTeamMembers = filterPeople(teamMembers);
  const isLoading = membersLoading || friendsLoading;

  useEffect(() => {
    refreshUserPresence([
      ...myFriends.map((friend) => friend._id),
      ...teamMembers.map((member) => member._id),
      lookupResult?.user?._id,
    ].filter(Boolean));
  }, [lookupResult?.user?._id, myFriends, refreshUserPresence, teamMembers]);

  return (
    <div className="min-h-full p-3 sm:p-6 lg:p-8 bg-gradient-to-b from-base-200/45 via-base-100 to-base-200/35">
      <div className="mx-auto max-w-7xl">
      {/* HEADER */}
      <div className="mb-6 rounded-[26px] border border-base-300/75 bg-base-100/88 px-5 py-5 shadow-[0_10px_28px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:px-6 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <UsersIcon className="size-8 text-primary" />
            Team & Friends
            </h1>
            <p className="text-base-content/60 mt-1">
              {myFriends.length} friend{myFriends.length !== 1 ? "s" : ""} · {teamMembers.length} team member{teamMembers.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Search input */}
          <div className="relative w-full sm:w-80">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-content/40" />
            <input
              type="text"
              placeholder="Search by name or language..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-base-300/80 bg-base-100/75 py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40"
            />
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-base-300/75 bg-base-100/90 p-5 sm:p-6 mb-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-xl p-2.5 bg-primary/12 text-primary">
            <HashIcon className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Add by User ID</h2>
            <p className="text-sm text-base-content/60">
              Find someone by their 6-character User ID and send a friend request, even outside your organization.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="rounded-xl border border-base-300/80 bg-base-200/35 px-3 py-2.5 flex items-center justify-between gap-3 min-w-[220px]">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-base-content/45 font-semibold">Your User ID</p>
              <p className="font-mono text-sm text-base-content/80">{authUser?.userCode || "Not set"}</p>
            </div>
            <button
              onClick={handleCopyMyUserId}
              disabled={!authUser?.userCode}
              className="btn btn-ghost btn-sm btn-square"
              title="Copy your User ID"
            >
              <CopyIcon className="size-4" />
            </button>
          </div>

          <input
            type="text"
            placeholder="Enter 6-character ID (e.g. A1B2C3)"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase())}
            className="flex-1 rounded-xl border border-base-300/80 bg-base-100/80 px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40"
          />
          <button
            onClick={handleLookup}
            disabled={isLookingUp || !lookupId.trim()}
            className="btn btn-primary gap-2 rounded-xl"
          >
            <SearchIcon className="size-4" />
            {isLookingUp ? "Searching..." : "Find User"}
          </button>
        </div>

        {lookupResult?.user && (
          <div className="mt-4 rounded-2xl border border-base-300/80 bg-base-200/35 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <Avatar
              src={lookupResult.user.profilePic}
              name={lookupResult.user.fullName}
              size="w-12 h-12"
              rounded="rounded-xl"
            />

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg truncate">{lookupResult.user.fullName}</p>
              <p className="text-xs text-base-content/50 font-mono truncate">ID: {lookupResult.user.userCode || lookupResult.user._id}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className={`badge badge-sm ${lookupResult.user.sameOrganization ? "badge-success" : "badge-warning"}`}>
                  {lookupResult.user.sameOrganization ? "Same org" : "External"}
                </span>
                {lookupResult.user.nativeLanguage && (
                  <span className="badge badge-ghost badge-sm capitalize">{lookupResult.user.nativeLanguage}</span>
                )}
                {lookupResult.user.learningLanguage && (
                  <span className="badge badge-outline badge-sm capitalize">Learning {lookupResult.user.learningLanguage}</span>
                )}
              </div>
            </div>

            {lookupResult.user.isFriend ? (
              <span className="btn btn-success btn-sm gap-2 pointer-events-none rounded-xl">
                <CheckCircleIcon className="size-4" /> Already connected
              </span>
            ) : lookupResult.existingRequest ? (
              <span className="btn btn-outline btn-sm gap-2 pointer-events-none rounded-xl">
                <CheckCircleIcon className="size-4 text-success" /> Request pending
              </span>
            ) : (
              <button
                onClick={() => sendRequest(lookupResult.user._id)}
                disabled={isSendingRequest}
                className="btn btn-primary btn-sm gap-2 rounded-xl"
              >
                <UserPlusIcon className="size-4" />
                {isSendingRequest ? "Sending..." : "Send Request"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl border border-base-300/70 bg-base-100/85 p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary rounded-xl p-2.5">
              <HeartIcon className="size-5" />
            </div>
            <div>
              <p className="text-sm text-base-content/60">Friends</p>
              <p className="text-2xl font-bold">{myFriends.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-base-300/70 bg-base-100/85 p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3">
            <div className="bg-secondary/10 text-secondary rounded-xl p-2.5">
              <Building2Icon className="size-5" />
            </div>
            <div>
              <p className="text-sm text-base-content/60">Team members</p>
              <p className="text-2xl font-bold">{teamMembers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : (
        <div className="space-y-10">
          <section>
            <div className="flex items-center gap-3 mb-4">
              <HeartIcon className="size-5 text-primary" />
              <div>
                <h2 className="text-xl font-bold">Friends</h2>
                <p className="text-sm text-base-content/60">People you are already connected with.</p>
              </div>
            </div>

            {filteredFriends.length === 0 ? (
              search ? (
                <div className="rounded-2xl border border-base-300/80 bg-base-100/80 p-8 text-center text-base-content/60">
                  No friend matches found for <strong>"{search}"</strong>
                </div>
              ) : (
                <NoFriendsFound />
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredFriends.map((friend) => (
                  <FriendCard key={`friend-${friend._id}`} friend={friend} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-3 mb-4">
              <Building2Icon className="size-5 text-secondary" />
              <div>
                <h2 className="text-xl font-bold">Team</h2>
                <p className="text-sm text-base-content/60">Everyone in your current organization.</p>
              </div>
            </div>

            {filteredTeamMembers.length === 0 ? (
              <div className="rounded-2xl border border-base-300/80 bg-base-100/80 p-8 text-center text-base-content/60">
                {search ? (
                  <>No team matches found for <strong>"{search}"</strong></>
                ) : (
                  <>No additional team members yet.</>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredTeamMembers.map((member) => (
                  <FriendCard key={`team-${member._id}`} friend={member} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      </div>
    </div>
  );
};

export default FriendsPage;