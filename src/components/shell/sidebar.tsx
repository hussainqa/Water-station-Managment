import { BrandBlock } from "./brand-block";
import { NavList } from "./nav-list";
import { SignOutButton } from "./sign-out-button";

/** Desktop sidebar (>= 1024 px): the floating sticky card, on the start side. */
export function Sidebar({ openProblems = 0 }: { openProblems?: number }) {
  return (
    <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] flex-col overflow-y-auto rounded-[20px] border border-border bg-card px-3 pb-3 pt-[18px] shadow-(--shadow-card) lg:flex">
      <BrandBlock />
      <NavList openProblems={openProblems} />
      <div className="mt-auto pt-3">
        <SignOutButton />
      </div>
    </aside>
  );
}
