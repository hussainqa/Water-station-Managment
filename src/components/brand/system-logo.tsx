import { cn } from "cn";

/** The system mark: accent tile with the water-drop glyph (paths from the prototype's logoSvg). */
export function SystemLogo({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const glyph = Math.round(size * 0.54);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground",
        className,
      )}
      style={{ width: size, height: size, borderRadius: size * 0.31 }}
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-1.9-.9-3.6-2.8-5.1S12.4 6.2 12 3.5c-.4 2.7-1.8 4.9-3.7 6.4S5.5 13.1 5.5 15a6.5 6.5 0 0 0 6.5 6.5z" />
        <path d="M8.6 15.4c1.1-.9 2.3-.9 3.4 0s2.3.9 3.4 0" />
      </svg>
    </span>
  );
}
