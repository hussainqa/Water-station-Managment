import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  const t = useTranslations("shell");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-9 w-56 max-w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
