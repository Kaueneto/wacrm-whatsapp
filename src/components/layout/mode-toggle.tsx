"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { DEFAULT_MODE } from "@/lib/themes";

import { useTranslations } from "next-intl";

const subscribeToHydration = () => () => undefined;
const getServerMode = () => DEFAULT_MODE;

/**
 * Light/dark mode toggle — a single icon button that flips the app
 * between the two modes. Sun shows in light mode (click → go dark),
 * moon shows in dark mode (click → go light); the label always names
 * the destination so screen-reader users hear what the click does.
 *
 * 40×40 hit target to match the header's other touch controls.
 */
export function ModeToggle({ className }: { className?: string }) {
  const t = useTranslations("ModeToggle");
  const tAppearance = useTranslations("Settings.appearance");
  const { mode, toggleMode } = useTheme();
  // Match the server's icon/label on the first hydration render. The boot
  // script may already have applied a different saved mode to the page.
  const visibleMode = useSyncExternalStore(subscribeToHydration, () => mode, getServerMode);
  const goingTo = visibleMode === "dark" ? "light" : "dark";
  const switchLabel = t("switchMode", { mode: tAppearance(`modes.${goingTo}`) });
  
  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={switchLabel}
      title={switchLabel}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {visibleMode === "dark" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </button>
  );
}
