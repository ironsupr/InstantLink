import { useEffect, useRef, useState } from "react";
import useAuthUser from "../hooks/useAuthUser";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { checkUserCodeAvailability, completeOnboarding } from "../lib/api";
import { setCachedAuthUser } from "../lib/authCache";
import {
  LoaderIcon,
  MapPinIcon,
  ShipWheelIcon,
  ShuffleIcon,
  UploadIcon,
  XIcon,
  UserIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  GlobeIcon,
} from "lucide-react";
import { LANGUAGES, LANGUAGE_TO_FLAG } from "../constants";
import Avatar from "../components/Avatar";
import { getInitials } from "../lib/avatarUtils";

/* ── Flag helper ── */
function LangFlag({ lang }) {
  if (!lang) return null;
  const code = LANGUAGE_TO_FLAG[lang.toLowerCase()];
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/24x18/${code}.png`}
      alt={lang}
      className="inline-block h-3.5 mr-1.5 align-middle rounded-sm"
    />
  );
}

/* ── Step definitions ── */
const STEPS = [
  { id: 1, label: "Your Identity", icon: UserIcon },
  { id: 2, label: "Languages", icon: GlobeIcon },
  { id: 3, label: "About You", icon: BookOpenIcon },
];

/* ═══════════════════════════════════════════════════════════════════ */
const OnboardingPage = () => {
  const { authUser } = useAuthUser();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [step, setStep] = useState(1);
  const [isGeneratingUserId, setIsGeneratingUserId] = useState(false);

  const [formState, setFormState] = useState({
    fullName: "",
    userCode: "",
    bio: "",
    nativeLanguage: "",
    learningLanguage: "",
    location: "",
    profilePic: "", // explicit URL; empty = show initials avatar
  });

  const set = (key, val) => setFormState((prev) => ({ ...prev, [key]: val }));

  /* Sync server data into form once React Query resolves.
     NOTE: profilePic is intentionally NOT synced — the external URL
     auto-assigned at signup is unreliable. We show the initials avatar
     by default; the user can explicitly upload or randomise. */
  useEffect(() => {
    if (!authUser) return;
    setFormState((prev) => ({
      ...prev,
      fullName: authUser.fullName || prev.fullName,
      userCode: authUser.userCode || prev.userCode,
      bio: authUser.bio || prev.bio,
      nativeLanguage: authUser.nativeLanguage || prev.nativeLanguage,
      learningLanguage: authUser.learningLanguage || prev.learningLanguage,
      location: authUser.location || prev.location,
      // profilePic deliberately omitted — initials avatar is default
    }));
  }, [authUser]);


  /* Mutations */
  const { mutate: onboardingMutation, isPending } = useMutation({
    mutationFn: completeOnboarding,
    onSuccess: (data) => {
      toast.success("Welcome to Collab! 🎉");
      setCachedAuthUser(data);
      queryClient.setQueryData(["authUser"], data);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || "Something went wrong");
    },
  });

  /* Image handlers */
  const handleRandomAvatar = () => {
    const idx = Math.floor(Math.random() * 100) + 1;
    set("profilePic", `https://avatar.iran.liara.run/public/${idx}.png`);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please pick a valid image."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { set("profilePic", ev.target.result); toast.success("Photo uploaded!"); };
    reader.readAsDataURL(file);
  };

  const clearProfilePic = () => {
    set("profilePic", "");
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  /* Step navigation */
  const hasValidUserCode = !formState.userCode || /^[A-Z0-9]{6}$/.test(formState.userCode);
  const canAdvanceStep1 = formState.fullName.trim().length > 0 && formState.location.trim().length > 0 && hasValidUserCode;

  const canAdvanceStep2 = formState.nativeLanguage && formState.learningLanguage;
  const canSubmit = formState.bio.trim().length > 0;

  const handleNext = () => setStep((s) => Math.min(s + 1, 3));
  const handleBack = () => setStep((s) => Math.max(s - 1, 1));
  const handleSubmit = (e) => { e.preventDefault(); onboardingMutation(formState); };

  const preparedName = formState.fullName || authUser?.fullName || "";
  const progress = (step / 3) * 100;

  return (
    <div className="min-h-screen bg-base-100 flex flex-col lg:flex-row overflow-hidden">

      {/* ══════════════════════════════════════════════════
           LEFT PANEL — hero profile picture 
          ══════════════════════════════════════════════════ */}
      <div className="lg:w-2/5 relative flex flex-col items-center justify-center p-8 lg:p-12 bg-gradient-to-br from-primary/20 via-base-200 to-secondary/20 border-b lg:border-b-0 lg:border-r border-base-300 overflow-hidden min-h-[300px]">

        {/* Decorative blobs */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center gap-5 w-full">

          {/* Branding */}
          <div className="flex items-center gap-2">
            <ShipWheelIcon className="size-7 text-primary" />
            <span className="text-2xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Collab
            </span>
          </div>

          {/* ── Avatar circle — large and clickable ── */}
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <Avatar
              src={formState.profilePic}
              name={preparedName}
              size="w-44 h-44 lg:w-52 lg:h-52"
              className="shadow-2xl ring-4 ring-white/20 ring-offset-4 ring-offset-transparent transition-all duration-300 group-hover:ring-primary/40"
            />

            {/* Hover overlay */}
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 pointer-events-none">
              <UploadIcon className="size-8 text-white" />
              <span className="text-white text-xs font-medium">Change photo</span>
            </div>

            {/* Remove button — only when a custom pic is set */}
            {formState.profilePic && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clearProfilePic(); }}
                className="absolute top-1 right-1 btn btn-circle btn-xs btn-error shadow-lg opacity-80 hover:opacity-100 transition-opacity"
                title="Remove photo"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-sm btn-outline border-base-content/20 hover:border-primary gap-2"
            >
              <UploadIcon className="size-4" /> Upload
            </button>
            <button
              type="button"
              onClick={handleRandomAvatar}
              className="btn btn-sm btn-ghost gap-2 text-base-content/60 hover:text-primary"
            >
              <ShuffleIcon className="size-4" /> Random
            </button>
          </div>
          <p className="text-xs text-base-content/35">JPG, PNG or WebP · max 5 MB</p>

          {/* ── Live profile preview card ── */}
          {preparedName && (
            <div className="w-full max-w-xs mt-2 bg-base-100/70 backdrop-blur-sm border border-base-300 rounded-2xl p-4 shadow text-left">
              <p className="text-[10px] uppercase tracking-widest text-base-content/40 font-semibold mb-3">Preview</p>
              <div className="flex items-center gap-3">
                <Avatar
                  src={formState.profilePic}
                  name={preparedName}
                  size="w-10 h-10"
                  className="shadow-sm flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{preparedName}</p>
                  {formState.location && (
                    <p className="text-xs text-base-content/50 flex items-center gap-1 truncate">
                      <MapPinIcon className="size-3 flex-shrink-0" /> {formState.location}
                    </p>
                  )}
                </div>
              </div>
              {(formState.nativeLanguage || formState.learningLanguage) && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {formState.nativeLanguage && (
                    <span className="badge badge-ghost badge-sm capitalize gap-1">
                      <LangFlag lang={formState.nativeLanguage} />{formState.nativeLanguage}
                    </span>
                  )}
                  {formState.learningLanguage && (
                    <span className="badge badge-primary badge-outline badge-sm capitalize gap-1">
                      <LangFlag lang={formState.learningLanguage} />{formState.learningLanguage}
                    </span>
                  )}
                </div>
              )}
              {formState.bio && (
                <p className="text-xs text-base-content/55 mt-2.5 line-clamp-2 leading-relaxed">{formState.bio}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
           RIGHT PANEL — multi-step form 
          ══════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 xl:px-24 overflow-y-auto">

        {/* Progress */}
        <div className="mb-8 max-w-lg mx-auto w-full">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-base-content/50">Step {step} of 3</p>
            <p className="text-sm font-semibold text-primary">{Math.round(progress)}% complete</p>
          </div>
          <div className="w-full bg-base-300 rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Step indicators */}
          <div className="flex justify-between mt-4">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const done = step > s.id;
              const current = step === s.id;
              return (
                <div key={s.id} className="flex flex-col items-center gap-1.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${done ? "bg-primary text-primary-content shadow-md shadow-primary/30" :
                    current ? "bg-primary/15 border-2 border-primary text-primary" :
                      "bg-base-200 border border-base-300 text-base-content/30"
                    }`}>
                    {done ? <CheckIcon className="size-4" /> : <Icon className="size-4" />}
                  </div>
                  <span className={`text-[11px] font-medium hidden sm:block ${current ? "text-primary" : "text-base-content/40"}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Form ─── */}
        <form onSubmit={handleSubmit} className="max-w-lg mx-auto w-full space-y-6">

          {/* ── Step 1: Identity ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">
                  Hello{preparedName ? `, ${preparedName.split(" ")[0]}` : ""}! 👋
                </h1>
                <p className="text-base-content/50 mt-1 text-sm">Let's start with the basics. What should people call you?</p>
              </div>

              <div className="form-control">
                <label className="label pb-1">
                  <span className="label-text font-medium">Full Name <span className="text-error">*</span></span>
                </label>
                <input
                  type="text"
                  value={formState.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  className="input input-bordered input-lg w-full focus:input-primary transition-colors"
                  placeholder="e.g. Arjun Sharma"
                  autoFocus
                />
                {/* Live initials preview */}
                {formState.fullName && (
                  <div className="flex items-center gap-3 mt-3 p-3 bg-base-200 rounded-xl">
                    <Avatar
                      name={formState.fullName}
                      size="w-10 h-10"
                    />
                    <div>
                      <p className="text-sm font-semibold">{formState.fullName}</p>
                      <p className="text-xs text-base-content/50">
                        Your initials avatar: <strong>{getInitials(formState.fullName)}</strong>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-control">
                <label className="label pb-1">
                  <span className="label-text font-medium">Location <span className="text-error">*</span></span>
                </label>
                <div className="relative">
                  <MapPinIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-base-content/40 pointer-events-none" />
                  <input
                    type="text"
                    value={formState.location}
                    onChange={(e) => set("location", e.target.value)}
                    className="input input-bordered input-lg w-full pl-11 focus:input-primary transition-colors"
                    placeholder="e.g. Mumbai, India"
                  />
                </div>
              </div>

              <div className="form-control">
                <label className="label pb-1">
                  <span className="label-text font-medium">Public User ID</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formState.userCode}
                    onChange={(e) => set("userCode", e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase())}
                    className="input input-bordered input-lg w-full focus:input-primary transition-colors font-mono tracking-[0.18em] uppercase"
                    placeholder="A1B2C3"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateRandomUserId}
                    disabled={isGeneratingUserId || isPending}
                    className="btn btn-outline btn-lg"
                    title="Generate available ID"
                  >
                    {isGeneratingUserId ? <LoaderIcon className="size-4 animate-spin" /> : <ShuffleIcon className="size-4" />}
                  </button>
                </div>
                <label className="label pt-1">
                  <span className="label-text-alt text-base-content/45">Optional · exactly 6 letters or digits</span>
                </label>
              </div>
            </div>
          )}

          {/* ── Step 2: Languages ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Languages 🌍</h1>
                <p className="text-base-content/50 mt-1 text-sm">Helps us connect you with the right language partners.</p>
              </div>

              <div className="form-control">
                <label className="label pb-1">
                  <span className="label-text font-medium">Native Language <span className="text-error">*</span></span>
                </label>
                <select
                  value={formState.nativeLanguage}
                  onChange={(e) => set("nativeLanguage", e.target.value)}
                  className="select select-bordered select-lg w-full focus:select-primary"
                >
                  <option value="">– Select your native language –</option>
                  {LANGUAGES.map((lang) => (
                    <option key={`native-${lang}`} value={lang.toLowerCase()}>{lang}</option>
                  ))}
                </select>
                {formState.nativeLanguage && (
                  <p className="text-xs text-base-content/50 mt-1 pl-1 flex items-center gap-1">
                    <LangFlag lang={formState.nativeLanguage} />
                    <span className="capitalize">{formState.nativeLanguage} selected</span>
                  </p>
                )}
              </div>

              <div className="form-control">
                <label className="label pb-1">
                  <span className="label-text font-medium">Preferred Language <span className="text-error">*</span></span>
                </label>
                <select
                  value={formState.learningLanguage}
                  onChange={(e) => set("learningLanguage", e.target.value)}
                  className="select select-bordered select-lg w-full focus:select-primary"
                >
                  <option value="">– Language you're learning –</option>
                  {LANGUAGES.filter((l) => l.toLowerCase() !== formState.nativeLanguage).map((lang) => (
                    <option key={`learning-${lang}`} value={lang.toLowerCase()}>{lang}</option>
                  ))}
                </select>
                {formState.learningLanguage && (
                  <p className="text-xs text-base-content/50 mt-1 pl-1 flex items-center gap-1">
                    <LangFlag lang={formState.learningLanguage} />
                    <span className="capitalize">{formState.learningLanguage} selected</span>
                  </p>
                )}
              </div>

              {formState.nativeLanguage && formState.learningLanguage && (
                <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                  <span className="badge badge-ghost badge-lg capitalize gap-1.5">
                    <LangFlag lang={formState.nativeLanguage} />{formState.nativeLanguage}
                  </span>
                  <ChevronRightIcon className="size-5 text-primary flex-shrink-0" />
                  <span className="badge badge-primary badge-lg capitalize gap-1.5">
                    <LangFlag lang={formState.learningLanguage} />{formState.learningLanguage}
                  </span>
                  <span className="ml-auto text-xs text-base-content/50 hidden sm:block">Great pairing! 🎯</span>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Bio ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Almost there! ✨</h1>
                <p className="text-base-content/50 mt-1 text-sm">Write a short bio so others know who they're talking to.</p>
              </div>

              <div className="form-control">
                <label className="label pb-1">
                  <span className="label-text font-medium">Bio <span className="text-error">*</span></span>
                  <span className="label-text-alt text-base-content/40">{formState.bio.length}/300</span>
                </label>
                <textarea
                  value={formState.bio}
                  onChange={(e) => set("bio", e.target.value.slice(0, 300))}
                  className="textarea textarea-bordered w-full h-36 focus:textarea-primary resize-none text-base leading-relaxed"
                  placeholder="Tell people about yourself, your interests, and your language learning goals..."
                  autoFocus
                />
              </div>

              {/* Summary review card */}
              <div className="bg-base-200 rounded-2xl p-4 border border-base-300">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/40 mb-3">Profile Summary</p>
                <div className="flex items-center gap-3">
                  <Avatar
                    src={formState.profilePic}
                    name={preparedName}
                    size="w-12 h-12"
                    className="shadow flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-bold truncate">{formState.fullName}</p>
                    {formState.location && (
                      <p className="text-xs text-base-content/50 truncate">{formState.location}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {formState.nativeLanguage && (
                        <span className="badge badge-ghost badge-sm capitalize">
                          <LangFlag lang={formState.nativeLanguage} />{formState.nativeLanguage}
                        </span>
                      )}
                      {formState.learningLanguage && (
                        <span className="badge badge-primary badge-outline badge-sm capitalize">
                          <LangFlag lang={formState.learningLanguage} />{formState.learningLanguage}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {formState.bio && (
                  <p className="text-sm text-base-content/60 mt-3 border-t border-base-300 pt-3 line-clamp-3">
                    {formState.bio}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ─── Navigation ─── */}
          <div className="flex gap-3 pt-2">
            {step > 1 && (
              <button type="button" onClick={handleBack} className="btn btn-ghost gap-2">
                <ChevronLeftIcon className="size-4" /> Back
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={step === 1 ? !canAdvanceStep1 : !canAdvanceStep2}
                className="btn btn-primary flex-1 gap-2 text-white shadow-lg shadow-primary/20"
              >
                Continue <ChevronRightIcon className="size-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isPending || !canSubmit}
                className="btn btn-primary flex-1 gap-2 text-white shadow-lg shadow-primary/20"
              >
                {isPending ? (
                  <><LoaderIcon className="animate-spin size-5" /> Creating profile...</>
                ) : (
                  <><CheckIcon className="size-5" /> Launch into Collab!</>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default OnboardingPage;
