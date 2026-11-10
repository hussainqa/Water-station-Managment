"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Laptop, Moon, Sun } from "lucide-react";
import { z } from "zod";
import { setThemeAction } from "@/lib/account/actions";
import { cn } from "cn";

export const THEMES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEMES)[number];
export const themeIcons = { light: Sun, dark: Moon, system: Laptop } as const;
const themeSchema = z.enum(THEMES);

/** Applies the saved profile theme once after sign-in (only when it differs). */
export function ThemeSync({ theme }: { theme: string }) {
  const { theme: current, setTheme } = useTheme();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const saved = themeSchema.safeParse(theme);
    if (saved.success && saved.data !== current) setTheme(saved.data);
  }, [theme, current, setTheme]);
  return null;
}

/** Current choice plus a setter that applies it and saves it to the profile. */
export function useThemeChoice() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("shell");
  const parsed = themeSchema.safeParse(theme);
  const value: ThemeChoice = parsed.success ? parsed.data : "system";

  function choose(next: string) {
    const parsedNext = themeSchema.safeParse(next);
    if (!parsedNext.success) return;
    setTheme(parsedNext.data);
    void setThemeAction(parsedNext.data).then((r) => {
      if (!r.ok) toast.error(t("user.themeSaveFailed"));
    });
  }
  return { value, choose };
}

/** Three-way segmented control (used in the drawer). */
export function ThemeSegmented() {
  const t = useTranslations("shell");
  const { value, choose } = useThemeChoice();
  return (
    <div
      role="radiogroup"
      aria-label={t("user.theme")}
      className="flex gap-0.5 rounded-[10px] bg-secondary p-[3px]"
    >
      {THEMES.map((id) => {
        const Icon = themeIcons[id];
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(id)}
            className={cn(
              "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected && "bg-card text-foreground shadow-sm",
            )}
          >
            <Icon aria-hidden="true" className="size-4 max-[400px]:hidden" />
            <span className="whitespace-nowrap">{t(`user.${id}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
