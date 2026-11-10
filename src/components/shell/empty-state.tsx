import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

type Props = {
  icon: LucideIcon;
  title: string;
  text?: string;
  /** Call to action, rendered below the text. */
  action?: React.ReactNode;
  className?: string;
};

/** Quiet centred empty state: icon tile, title, text, optional action. */
export function EmptyState({ icon: Icon, title, text, action, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-[34px] text-center", className)}>
      <span className="mb-3.5 flex size-[52px] items-center justify-center rounded-2xl bg-background text-muted-foreground">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {text ? <p className="mt-1.5 max-w-[52ch] text-sm text-muted-foreground">{text}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
