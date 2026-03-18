import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRecommendedUsers, getUserFriends, getOutgoingFriendReqs, sendFriendRequest, getMyOrganization } from "../lib/api";
import { Link, useSearchParams } from "react-router";
import { SearchIcon, HashIcon, CheckCircleIcon, UserPlusIcon, MessageSquareIcon } from "lucide-react";
import { getLanguageFlag } from "../components/FriendCard";
import Avatar from "../components/Avatar";



const SearchPage = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [outgoingRequestsIds, setOutgoingRequestsIds] = useState(new Set());

  // Sync URL → query state on back/forward navigation
  useEffect(() => {
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);

  // Update URL when query changes
  const handleQueryChange = (val) => {
    setQuery(val);
    if (val.trim()) setSearchParams({ q: val }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["users"],
    queryFn: getRecommendedUsers,
  });

  const { data: friends = [] } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });

  const { data: outgoingFriendReqs } = useQuery({
    queryKey: ["outgoingFriendReqs"],
    queryFn: getOutgoingFriendReqs,
  });

  const { mutate: sendRequestMutation, isPending } = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outgoingFriendReqs"] }),
  });

  useEffect(() => {
    const outgoingIds = new Set();
    if (outgoingFriendReqs?.length > 0) {
      outgoingFriendReqs.forEach((req) => outgoingIds.add(req.recipient._id));
      setOutgoingRequestsIds(outgoingIds);
    }
  }, [outgoingFriendReqs]);

  // Build a combined people pool: friends + recommended
  const allPeople = [
    ...friends.map((f) => ({ ...f, isFriend: true })),
    ...allUsers.map((u) => ({ ...u, isFriend: false })),
  ];

  const q = query.toLowerCase().trim();

  const filteredPeople = q
    ? allPeople.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        (u.nativeLanguage || "").toLowerCase().includes(q) ||
        (u.learningLanguage || "").toLowerCase().includes(q)
    )
    : [];

  const filteredChannels = q ? CHANNELS.filter((c) => c.name.includes(q) || c.desc.toLowerCase().includes(q)) : [];

  const showResults = q.length > 0;
  const hasResults = filteredPeople.length > 0 || filteredChannels.length > 0;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight mb-1">Search & Discovery</h1>
        <p className="text-base-content/60">Find people and channels across your workspace.</p>
      </div>

      {/* SEARCH BAR */}
      <div className="relative mb-8">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-base-content/40" />
        <input
          type="text"
          placeholder="Search people, channels..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="input input-bordered w-full pl-12 h-14 text-lg"
          autoFocus
        />

        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-base-content"
          >
            ✕
          </button>
        )}
      </div>

      {/* RESULTS */}
      {showResults ? (
        hasResults ? (
          <div className="space-y-8">
            {/* PEOPLE */}
            {filteredPeople.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50 mb-4">People</h2>
                <div className="space-y-3">
                  {filteredPeople.map((user) => (
                    <div
                      key={user._id}
                      className="flex items-center justify-between bg-base-200 p-4 rounded-xl border border-base-300"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar
                          src={user.profilePic}
                          name={user.fullName}
                          size="w-11 h-11"
                        />

                        <div>
                          <p className="font-semibold">{user.fullName}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {user.nativeLanguage && (
                              <span className="badge badge-ghost badge-sm capitalize gap-1">
                                {getLanguageFlag(user.nativeLanguage)}
                                {user.nativeLanguage}
                              </span>
                            )}
                            {user.learningLanguage && (
                              <span className="badge badge-primary badge-outline badge-sm capitalize gap-1">
                                {getLanguageFlag(user.learningLanguage)}
                                {user.learningLanguage}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {user.isFriend ? (
                          <Link to={`/chat/${user._id}`} className="btn btn-primary btn-sm gap-1">
                            <MessageSquareIcon className="size-4" /> Chat
                          </Link>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline gap-1"
                            onClick={() => sendRequestMutation(user._id)}
                            disabled={outgoingRequestsIds.has(user._id) || isPending}
                          >
                            {outgoingRequestsIds.has(user._id) ? (
                              <><CheckCircleIcon className="size-4 text-success" /> Sent</>
                            ) : (
                              <><UserPlusIcon className="size-4" /> Connect</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* CHANNELS */}
            {filteredChannels.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50 mb-4">Channels</h2>
                <div className="space-y-3">
                  {filteredChannels.map((ch) => (
                    <Link
                      key={ch.name}
                      to={`/chat/${ch.name}`}
                      className="flex items-center gap-4 bg-base-200 p-4 rounded-xl border border-base-300 hover:border-primary/40 hover:bg-base-300 transition-colors"
                    >
                      <div className="bg-primary/10 p-2 rounded-lg text-primary">
                        <HashIcon className="size-5" />
                      </div>
                      <div>
                        <p className="font-semibold">#{ch.name}</p>
                        <p className="text-xs text-base-content/50">{ch.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="text-center py-16">
            <SearchIcon className="size-10 mx-auto text-base-content/20 mb-3" />
            <p className="text-base-content/50">No results for <strong>"{query}"</strong></p>
          </div>
        )
      ) : (
        /* DEFAULT STATE */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card bg-base-200 p-6">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <HashIcon className="size-4 text-primary" /> Popular Channels
            </h3>
            <ul className="space-y-3">
              {CHANNELS.map((ch) => (
                <li key={ch.name}>
                  <Link
                    to={`/chat/${ch.name}`}
                    className="flex items-center gap-2 text-primary hover:underline text-sm font-medium"
                  >
                    #{ch.name}
                  </Link>
                  <p className="text-xs text-base-content/40 mt-0.5">{ch.desc}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="card bg-base-200 p-6">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <SearchIcon className="size-4 text-primary" /> Search Tips
            </h3>
            <ul className="space-y-2 text-sm text-base-content/70">
              <li>🔍 Search by <strong>name</strong> to find teammates</li>
              <li>🌍 Search by <strong>language</strong> to find language partners</li>
              <li># Search by <strong>channel name</strong> to jump into conversations</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
