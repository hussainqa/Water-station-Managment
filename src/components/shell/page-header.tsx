import { cn } from "cn";

type Props = {
  title: string;
  description?: React.ReactNode;
  /** Buttons for the end side of the header. */
  actions?: React.ReactNode;
  className?: string;
};

/** Page title row used by every screen in the app group. */
export function PageHeader({ title, description, actions, className }: Props) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        <h1 className="text-[23px] font-bold leading-tight lg:text-[28px]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-[70ch] text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 max-[420px]:w-full max-[420px]:[&>*]:flex-1">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
