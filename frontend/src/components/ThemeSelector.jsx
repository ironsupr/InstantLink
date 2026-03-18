import { useRef, useState, useEffect } from "react";
import { PaletteIcon } from "lucide-react";
import { useThemeStore } from "../store/useThemeStore";
import { THEMES } from "../constants";

const ThemeSelector = () => {
  const { theme, setTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost btn-circle"
        title="Change theme"
      >
        <PaletteIcon className="size-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-base-100 border border-base-300 rounded-xl shadow-xl z-50 p-1 max-h-80 overflow-y-auto">
          {THEMES.map((themeOption) => (
            <button
              key={themeOption.name}
              onClick={() => { setTheme(themeOption.name); setOpen(false); }}
              className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors text-sm ${
                theme === themeOption.name
                  ? "bg-primary/10 text-primary font-semibold"
                  : "hover:bg-base-200 text-base-content"
              }`}
            >
              <PaletteIcon className="size-4 flex-shrink-0" />
              <span className="flex-1 text-left">{themeOption.label}</span>
              <div className="flex gap-1">
                {themeOption.colors.map((color, i) => (
                  <span key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
export default ThemeSelector;
