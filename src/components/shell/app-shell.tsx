import { useTranslations } from "next-intl";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { ThemeSync } from "./theme-controls";
import { TopBar } from "./top-bar";
import type { ShellUser } from "./types";
import type { Range } from "@/lib/context/filters-schema";

type Props = {
  user: ShellUser;
  plants: { id: string; name: string }[];
  plantId: string | null;
  range: Range;
  /** problems awaiting obstacles or an action, for ALL plants (nav badge) */
  openProblems?: number;
  children: React.ReactNode;
};

/** The signed-in frame: sidebar, top bar, content, bottom tabs on small screens. */
export function AppShell({ user, plants, plantId, range, openProblems = 0, children }: Props) {
  const t = useTranslations("shell");
  return (
    <div className="grid min-h-dvh grid-cols-1 gap-5 px-[max(1rem,env(safe-area-inset-left))] py-4 max-lg:pb-[calc(84px+env(safe-area-inset-bottom))] max-lg:pt-0 lg:grid-cols-[252px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t("skipToContent")}
      </a>
      <ThemeSync theme={user.theme} />
      <Sidebar openProblems={openProblems} />
      <div className="flex min-w-0 flex-col">
        <TopBar user={user} plants={plants} plantId={plantId} range={range} openProblems={openProblems} />
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col gap-5 pb-10 pt-2 outline-none">
          {children}
        </main>
      </div>
      <TabBar openProblems={openProblems} />
    </div>
  );
}
