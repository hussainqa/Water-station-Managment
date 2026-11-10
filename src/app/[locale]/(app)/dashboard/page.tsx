import { Factory, LayoutDashboard, Plus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { getPlantOptions } from "@/lib/context/plants";
import { cn } from "cn";

export default async function DashboardPage({
  params,
}: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, plants] = await Promise.all([
    getTranslations("shell"),
    getPlantOptions(user.id),
  ]);

  return (
    <>
      <PageHeader title={t("pages.dashboard")} />
      <section className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
        {plants.length === 0 ? (
          <EmptyState
            icon={Factory}
            title={t("dashboard.empty.title")}
            text={t("dashboard.empty.text")}
            action={
              <Link
                href="/plants"
                className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 rounded-[13px] px-5 text-[15px]")}
              >
                <Plus aria-hidden="true" className="size-[18px]" />
                {t("dashboard.empty.cta")}
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={LayoutDashboard}
            title={t("dashboard.placeholder.title")}
            text={t("dashboard.placeholder.text")}
          />
        )}
      </section>
    </>
  );
}
