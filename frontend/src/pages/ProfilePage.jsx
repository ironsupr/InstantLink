import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { checkUserCodeAvailability, updateProfile } from "../lib/api";
import { setCachedAuthUser } from "../lib/authCache";
import useAuthUser from "../hooks/useAuthUser";
import {
    CameraIcon, SaveIcon, LoaderIcon, UserIcon,
    MapPinIcon, GlobeIcon, FileTextIcon, ArrowLeftIcon, CopyIcon, ShuffleIcon,
} from "lucide-react";
import { Link } from "react-router";
import { LANGUAGES } from "../constants";
import Avatar from "../components/Avatar";

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const COMPRESS_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1400;

const loadImageFromDataUrl = (dataUrl) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not process selected image"));
    image.src = dataUrl;
});

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(new Error("Could not read selected image"));
    reader.readAsDataURL(file);
});

const compressProfileImage = async (dataUrl) => {
    const image = await loadImageFromDataUrl(dataUrl);
    const ratio = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
    const targetWidth = Math.max(1, Math.round(image.width * ratio));
    const targetHeight = Math.max(1, Math.round(image.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    let quality = 0.86;
    let compressed = canvas.toDataURL("image/jpeg", quality);
    while (compressed.length > 2_000_000 && quality > 0.56) {
        quality -= 0.1;
        compressed = canvas.toDataURL("image/jpeg", quality);
    }
    return compressed;
};


const ProfilePage = () => {

    const { authUser } = useAuthUser();
    const queryClient = useQueryClient();
    const fileInputRef = useRef(null);

    const [form, setForm] = useState({
        fullName: "",
        userCode: "",
        bio: "",
        nativeLanguage: "",
        learningLanguage: "",
        location: "",
        profilePic: "",
        removeProfilePic: false,
    });
    const [isGeneratingUserId, setIsGeneratingUserId] = useState(false);

    // Sync from authUser once available
    useEffect(() => {
        if (!authUser) return;
        setForm({
            fullName: authUser.fullName || "",
            userCode: authUser.userCode || "",
            bio: authUser.bio || "",
            nativeLanguage: authUser.nativeLanguage || "",
            learningLanguage: authUser.learningLanguage || "",
            location: authUser.location || "",
            profilePic: "",   // intentionally empty; show initials by default
            removeProfilePic: false,
        });
    }, [authUser]);

    const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
        if (file.size > MAX_PROFILE_IMAGE_BYTES) { toast.error("Image must be under 5 MB"); return; }

        try {
            let imageDataUrl = await fileToDataUrl(file);
            if (file.size > COMPRESS_THRESHOLD_BYTES) {
                imageDataUrl = await compressProfileImage(imageDataUrl);
                toast.success("Image optimized for faster upload");
            }
            setForm((prev) => ({ ...prev, profilePic: imageDataUrl, removeProfilePic: false }));
        } catch (error) {
            toast.error(error?.message || "Could not process selected image");
        }
    };

    const { mutate: save, isPending } = useMutation({
        mutationFn: updateProfile,
        onSuccess: (data) => {
            toast.success("Profile updated!");
            setCachedAuthUser({ success: true, user: data.user });
            queryClient.setQueryData(["authUser"], (old) =>
                old ? { ...old, user: data.user } : old
            );
            setForm((prev) => ({ ...prev, profilePic: "", removeProfilePic: false }));
        },
        onError: (err) => toast.error(err.response?.data?.message || "Failed to save profile"),
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.fullName.trim()) return toast.error("Name is required");
        const normalizedCode = form.userCode.trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
            return toast.error("User ID must be exactly 6 letters or digits");
        }
        const payload = { ...form, userCode: normalizedCode };
        if (!payload.profilePic && !payload.removeProfilePic) delete payload.profilePic;
        save(payload);
    };

    const handleSaveUserId = () => {
        const normalizedCode = form.userCode.trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
            return toast.error("User ID must be exactly 6 letters or digits");
        }
        save({ userCode: normalizedCode });
    };

    const handleCopyUserId = async () => {
        if (!authUser?._id) return;
        try {
            await navigator.clipboard.writeText(form.userCode || authUser.userCode || "");
            toast.success("User ID copied");
        } catch {
            toast.error("Could not copy User ID");
        }
    };

    const handleGenerateRandomUserId = async () => {
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const buildCandidate = () => Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

        setIsGeneratingUserId(true);
        try {
            for (let attempt = 0; attempt < 20; attempt += 1) {
                const candidate = buildCandidate();
                const result = await checkUserCodeAvailability(candidate);
                if (result?.available) {
                    set("userCode", candidate);
                    toast.success("Random available ID generated");
                    return;
                }
            }
            toast.error("Could not find an available ID. Try again.");
        } catch (error) {
            toast.error(error?.response?.data?.message || "Could not generate ID right now");
        } finally {
            setIsGeneratingUserId(false);
        }
    };

    const displayName = form.fullName || authUser?.fullName || "";

    return (
        <div className="min-h-screen bg-base-100 p-4 sm:p-8">
            <div className="max-w-2xl mx-auto">
                {/* HEADER */}
                <div className="flex items-center gap-3 mb-8">
                    <Link to="/" className="btn btn-ghost btn-sm btn-circle">
                        <ArrowLeftIcon className="size-4" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight">Edit Profile</h1>
                        <p className="text-base-content/50 text-sm">Changes are saved immediately</p>
                    </div>
                </div>

                <div className="card bg-base-200 border border-base-300 p-5 mb-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold uppercase tracking-wider text-base-content/45">User ID</p>
                            <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
                                <input
                                    type="text"
                                    value={form.userCode}
                                    onChange={(e) => set("userCode", e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase())}
                                    className="input input-bordered w-full sm:max-w-[220px] focus:input-primary font-mono tracking-[0.18em] uppercase"
                                    placeholder="A1B2C3"
                                />
                                <span className="text-xs text-base-content/45">Exactly 6 letters or digits</span>
                            </div>
                            <p className="mt-1 text-xs text-base-content/45">This is your public friend ID used in Team & Friends lookup.</p>
                        </div>
                        <div className="flex gap-2 self-start sm:self-center">
                            <button
                                type="button"
                                onClick={handleGenerateRandomUserId}
                                disabled={isGeneratingUserId || isPending}
                                className="btn btn-ghost btn-sm gap-2"
                            >
                                {isGeneratingUserId ? <LoaderIcon className="size-4 animate-spin" /> : <ShuffleIcon className="size-4" />} Random
                            </button>
                            <button
                                type="button"
                                onClick={handleCopyUserId}
                                disabled={!(form.userCode || authUser?.userCode)}
                                className="btn btn-outline btn-sm gap-2"
                            >
                                <CopyIcon className="size-4" /> Copy ID
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveUserId}
                                disabled={isPending || !/^[A-Z0-9]{6}$/.test(form.userCode.trim().toUpperCase())}
                                className="btn btn-primary btn-sm"
                            >
                                Save ID
                            </button>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* AVATAR SECTION */}
                    <div className="card bg-base-200 border border-base-300 p-6">
                        <h2 className="font-bold mb-4 flex items-center gap-2">
                            <UserIcon className="size-4 text-primary" /> Profile Picture
                        </h2>
                        <div className="flex items-center gap-6">
                            <div
                                className="relative cursor-pointer ring-2 ring-base-300 hover:ring-primary transition-all rounded-2xl group overflow-hidden"
                                onClick={() => fileInputRef.current?.click()}
                                title="Click to upload photo"
                            >
                                <Avatar
                                    src={form.profilePic || authUser?.profilePic}
                                    name={displayName}
                                    size="w-24 h-24"
                                    rounded="rounded-2xl"
                                />
                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <CameraIcon className="size-6 text-white" />
                                </div>
                            </div>


                            <div className="space-y-2">
                                <input
                                    type="file"
                                    accept="image/*"
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={handleImageUpload}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="btn btn-outline btn-sm gap-2"
                                >
                                    <CameraIcon className="size-4" /> Upload Photo
                                </button>
                                {(form.profilePic || authUser?.profilePic) && (
                                    <button
                                        type="button"
                                        onClick={() => setForm((prev) => ({ ...prev, profilePic: "", removeProfilePic: true }))}
                                        className="btn btn-ghost btn-sm text-error block"
                                    >
                                        Remove photo
                                    </button>
                                )}
                                <p className="text-xs text-base-content/40">
                                    JPG, PNG, GIF · max 5 MB<br />
                                    Or keep the initials avatar — it's generated from your name
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* BASIC INFO */}
                    <div className="card bg-base-200 border border-base-300 p-6 space-y-5">
                        <h2 className="font-bold flex items-center gap-2">
                            <FileTextIcon className="size-4 text-secondary" /> Basic Information
                        </h2>

                        {/* Full Name */}
                        <div className="form-control">
                            <label className="label pb-1">
                                <span className="label-text font-medium">Full Name <span className="text-error">*</span></span>
                            </label>
                            <input
                                type="text"
                                value={form.fullName}
                                onChange={(e) => set("fullName", e.target.value)}
                                className="input input-bordered w-full focus:input-primary"
                                placeholder="Your full name"
                            />
                        </div>

                        {/* Bio */}
                        <div className="form-control">
                            <label className="label pb-1">
                                <span className="label-text font-medium">Bio</span>
                                <span className="label-text-alt text-base-content/40">{form.bio.length}/160</span>
                            </label>
                            <textarea
                                value={form.bio}
                                onChange={(e) => set("bio", e.target.value.slice(0, 160))}
                                className="textarea textarea-bordered resize-none focus:textarea-primary"
                                placeholder="Tell your teammates a little about yourself…"
                                rows={3}
                            />
                        </div>

                        {/* Location */}
                        <div className="form-control">
                            <label className="label pb-1">
                                <span className="label-text font-medium flex items-center gap-1">
                                    <MapPinIcon className="size-3.5" /> Location
                                </span>
                            </label>
                            <input
                                type="text"
                                value={form.location}
                                onChange={(e) => set("location", e.target.value)}
                                className="input input-bordered w-full focus:input-primary"
                                placeholder="e.g. Mumbai, India"
                            />
                        </div>
                    </div>

                    {/* LANGUAGES */}
                    <div className="card bg-base-200 border border-base-300 p-6 space-y-5">
                        <h2 className="font-bold flex items-center gap-2">
                            <GlobeIcon className="size-4 text-success" /> Languages
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Native Language */}
                            <div className="form-control">
                                <label className="label pb-1">
                                    <span className="label-text font-medium">Native Language</span>
                                </label>
                                <select
                                    value={form.nativeLanguage}
                                    onChange={(e) => set("nativeLanguage", e.target.value)}
                                    className="select select-bordered focus:select-primary"
                                >
                                    <option value="">Select language…</option>
                                    {LANGUAGES.map((language) => (
                                        <option key={language} value={language}>{language}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Preferred Language */}
                            <div className="form-control">
                                <label className="label pb-1">
                                    <span className="label-text font-medium">Preferred Language</span>
                                </label>
                                <select
                                    value={form.learningLanguage}
                                    onChange={(e) => set("learningLanguage", e.target.value)}
                                    className="select select-bordered focus:select-primary"
                                >
                                    <option value="">Select language…</option>
                                    {LANGUAGES.filter((language) => language !== form.nativeLanguage).map((language) => (
                                        <option key={language} value={language}>{language}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* SAVE BUTTON */}
                    <button
                        type="submit"
                        disabled={isPending || !form.fullName.trim()}
                        className="btn btn-primary w-full gap-2 shadow-lg shadow-primary/20"
                    >
                        {isPending ? (
                            <><LoaderIcon className="animate-spin size-5" /> Saving…</>
                        ) : (
                            <><SaveIcon className="size-5" /> Save Changes</>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ProfilePage;
