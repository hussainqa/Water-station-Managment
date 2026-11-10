import type { Range } from "@/lib/context/filters-schema";
import { ContextSelectors } from "./context-selectors";
import { LanguageSwitch } from "./language-switch";
import { MobileDrawer } from "./mobile-drawer";
import type { ShellUser } from "./types";
import { UserMenu } from "./user-menu";

type Props = {
  user: ShellUser;
  plants: { id: string; name: string }[];
  plantId: string | null;
  range: Range;
};

/** Sticky translucent top bar: menu (small screens), plant, period, language, user. */
export function TopBar({ user, plants, plantId, range }: Props) {
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-1.5 flex flex-wrap items-center gap-2.5 bg-(--glass) px-4 py-2.5 backdrop-blur-[18px] backdrop-saturate-[1.6] lg:mx-0 lg:px-1">
      <MobileDrawer user={user} />
      <ContextSelectors plants={plants} plantId={plantId} range={range} />
      <div className="flex-1" />
      <LanguageSwitch />
      <UserMenu user={user} />
    </header>
  );
}
