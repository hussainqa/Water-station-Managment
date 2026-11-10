import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shell/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "cn";

export default async function AppNotFound() {
  const t = await getTranslations("shell");
  return (
    <section className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
      <EmptyState
        icon={SearchX}
        title={t("notFound.title")}
        text={t("notFound.text")}
        action={
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-[13px] px-5 text-[15px]")}
          >
            {t("notFound.back")}
          </Link>
        }
      />
    </section>
  );
}
