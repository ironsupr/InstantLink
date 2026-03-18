import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { createOrganization, joinOrganization } from "../lib/api";
import {
    ShipWheelIcon,
    Building2,

    KeyRoundIcon,
    ChevronRightIcon,
    LoaderIcon,
    CheckIcon,
    PlusIcon,
    HashIcon,
} from "lucide-react";

const OrganizationSetupPage = () => {
    const queryClient = useQueryClient();
    const [mode, setMode] = useState(null); // "create" | "join"
    const [createForm, setCreateForm] = useState({ name: "", description: "" });
    const [inviteCode, setInviteCode] = useState("");

    const { mutate: create, isPending: creating } = useMutation({
        mutationFn: createOrganization,
        onSuccess: () => {
            toast.success("Organization created! Welcome aboard \uD83C\uDF89");
            queryClient.invalidateQueries({ queryKey: ["myOrganization"] });
            queryClient.invalidateQueries({ queryKey: ["authUser"] });
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to create organization"),
    });

    const { mutate: join, isPending: joining } = useMutation({
        mutationFn: joinOrganization,
        onSuccess: () => {
            toast.success("Joined organization! Welcome \uD83C\uDF89");
            queryClient.invalidateQueries({ queryKey: ["myOrganization"] });
            queryClient.invalidateQueries({ queryKey: ["authUser"] });
        },
        onError: (err) => toast.error(err.response?.data?.message || "Invalid invite code"),
    });

    const handleCreate = (e) => {
        e.preventDefault();
        if (!createForm.name.trim()) return toast.error("Organization name is required");
        create(createForm);
    };

    const handleJoin = (e) => {
        e.preventDefault();
        if (!inviteCode.trim()) return toast.error("Please enter an invite code");
        join({ inviteCode });
    };

    return (
        <div className="min-h-screen bg-base-100 flex flex-col lg:flex-row overflow-hidden">
            {/* ── Left Hero ── */}
            <div className="lg:w-2/5 relative flex flex-col items-center justify-center p-10 bg-gradient-to-br from-primary/25 via-base-200 to-secondary/20 border-b lg:border-b-0 lg:border-r border-base-300 overflow-hidden min-h-[260px]">
                {/* Blobs */}
                <div className="absolute -top-20 -left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-20 -right-20 w-72 h-72 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 text-center space-y-6">
                    <div className="flex items-center justify-center gap-2">
                        <ShipWheelIcon className="size-8 text-primary" />
                        <span className="text-2xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                            Collab
                        </span>
                    </div>

                    {/* Illustration */}
                    <div className="flex justify-center gap-4">
                        {["A", "B", "C"].map((letter, i) => (
                            <div
                                key={letter}
                                className="w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center text-xl font-bold"
                                style={{
                                    background: ["#e8f0fe", "#e6f4ea", "#fef7e0"][i],
                                    color: ["#1a73e8", "#0f9d58", "#f29900"][i],
                                    transform: `rotate(${[-5, 0, 5][i]}deg)`,
                                }}
                            >
                                {letter}
                            </div>
                        ))}
                    </div>

                    <div>
                        <h2 className="text-2xl font-extrabold tracking-tight">Your Workspace</h2>
                        <p className="text-base-content/55 mt-2 text-sm max-w-xs mx-auto">
                            Organizations keep your team isolated — only members can see each other, chat, and collaborate.
                        </p>
                    </div>

                    {/* Feature pills */}
                    <div className="flex flex-wrap justify-center gap-2">
                        {["Private channels", "Invite-only access", "Team isolation", "Admin controls"].map((f) => (
                            <span key={f} className="badge badge-ghost badge-sm gap-1">
                                <CheckIcon className="size-3 text-success" /> {f}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right Form ── */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 sm:px-12 lg:px-20">
                <div className="w-full max-w-md">
                    {!mode ? (
                        /* ─ Mode selection ─ */
                        <div className="space-y-6">
                            <div>
                                <h1 className="text-3xl font-extrabold tracking-tight">Join a Workspace</h1>
                                <p className="text-base-content/50 mt-1 text-sm">
                                    Create a new organization or join an existing one with an invite code.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <button
                                    onClick={() => setMode("create")}
                                    className="card bg-base-200 border border-base-300 hover:border-primary/50 hover:bg-base-300 transition-all p-6 text-left group cursor-pointer"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="bg-primary/10 p-3 rounded-xl group-hover:bg-primary/20 transition-colors">
                                            <Building2 className="size-6 text-primary" />

                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-base">Create Organization</p>
                                            <p className="text-sm text-base-content/55">Set up a new workspace for your team</p>
                                        </div>
                                        <ChevronRightIcon className="size-5 text-base-content/30 group-hover:text-primary transition-colors" />
                                    </div>
                                </button>

                                <button
                                    onClick={() => setMode("join")}
                                    className="card bg-base-200 border border-base-300 hover:border-secondary/50 hover:bg-base-300 transition-all p-6 text-left group cursor-pointer"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="bg-secondary/10 p-3 rounded-xl group-hover:bg-secondary/20 transition-colors">
                                            <KeyRoundIcon className="size-6 text-secondary" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-base">Join with Invite Code</p>
                                            <p className="text-sm text-base-content/55">Enter an 8-character code from your team</p>
                                        </div>
                                        <ChevronRightIcon className="size-5 text-base-content/30 group-hover:text-secondary transition-colors" />
                                    </div>
                                </button>
                            </div>
                        </div>
                    ) : mode === "create" ? (
                        /* ─ Create form ─ */
                        <form onSubmit={handleCreate} className="space-y-6">
                            <div>
                                <button type="button" onClick={() => setMode(null)} className="btn btn-ghost btn-sm mb-4 -ml-2">
                                    ← Back
                                </button>
                                <h1 className="text-3xl font-extrabold tracking-tight">Create Organization</h1>
                                <p className="text-base-content/50 mt-1 text-sm">
                                    You'll be the owner. An invite code will be generated automatically.
                                </p>
                            </div>

                            <div className="form-control">
                                <label className="label pb-1">
                                    <span className="label-text font-medium">Organization Name <span className="text-error">*</span></span>
                                </label>
                                <input
                                    type="text"
                                    value={createForm.name}
                                    onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                                    className="input input-bordered input-lg w-full focus:input-primary"
                                    placeholder="e.g. BizzColab Inc."
                                    autoFocus
                                />
                            </div>

                            <div className="form-control">
                                <label className="label pb-1">
                                    <span className="label-text font-medium">Description</span>
                                    <span className="label-text-alt text-base-content/40">optional</span>
                                </label>
                                <textarea
                                    value={createForm.description}
                                    onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                                    className="textarea textarea-bordered resize-none focus:textarea-primary"
                                    placeholder="What does your organization do?"
                                    rows={3}
                                />
                            </div>

                            {/* Default channels preview */}
                            <div className="bg-base-200 rounded-2xl p-4 border border-base-300">
                                <p className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-3">
                                    Default Channels Created
                                </p>
                                <div className="space-y-2">
                                    {["general", "announcements"].map((ch) => (
                                        <div key={ch} className="flex items-center gap-2 text-sm text-base-content/70">
                                            <HashIcon className="size-4 text-primary" />
                                            <span className="font-medium">{ch}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={creating || !createForm.name.trim()}
                                className="btn btn-primary w-full gap-2 text-white shadow-lg shadow-primary/20"
                            >
                                {creating ? (
                                    <><LoaderIcon className="animate-spin size-5" /> Creating...</>
                                ) : (
                                    <><PlusIcon className="size-5" /> Create Organization</>
                                )}
                            </button>
                        </form>
                    ) : (
                        /* ─ Join form ─ */
                        <form onSubmit={handleJoin} className="space-y-6">
                            <div>
                                <button type="button" onClick={() => setMode(null)} className="btn btn-ghost btn-sm mb-4 -ml-2">
                                    ← Back
                                </button>
                                <h1 className="text-3xl font-extrabold tracking-tight">Join Organization</h1>
                                <p className="text-base-content/50 mt-1 text-sm">
                                    Ask your team admin for the 8-character invite code.
                                </p>
                            </div>

                            <div className="form-control">
                                <label className="label pb-1">
                                    <span className="label-text font-medium">Invite Code <span className="text-error">*</span></span>
                                </label>
                                <input
                                    type="text"
                                    value={inviteCode}
                                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                    className="input input-bordered input-lg w-full focus:input-secondary font-mono tracking-[0.3em] text-center text-xl"
                                    placeholder="A3F7B2C1"
                                    maxLength={8}
                                    autoFocus
                                />
                                <p className="label-text-alt text-base-content/40 mt-1 pl-1">
                                    Codes are 8 characters, uppercase letters and numbers.
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={joining || inviteCode.trim().length < 8}
                                className="btn btn-secondary w-full gap-2 text-white shadow-lg shadow-secondary/20"
                            >
                                {joining ? (
                                    <><LoaderIcon className="animate-spin size-5" /> Joining...</>
                                ) : (
                                    <><KeyRoundIcon className="size-5" /> Join Organization</>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OrganizationSetupPage;
