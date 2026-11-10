import { Factory } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { clampStep } from "@/components/assessments/wizard/lib";
import { Wizard } from "@/components/assessments/wizard/wizard";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { withUser } from "@/db/with-user";
import { Link, redirect } from "@/i18n/navigation";
import { idSchema } from "@/lib/assessments/schemas";
import * as service from "@/lib/assessments/service";
import { requireUser } from "@/lib/auth/session";
import { getFilters } from "@/lib/context/filters";
import { listPlants } from "@/lib/plants/service";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/assessments/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const sp = await searchParams;
  const t = await getTranslations("wizard");

  const filters = await getFilters();
  const plants = await withUser(user.id, (tx) => listPlants(tx));
  const rawDraft = first(sp.draft);
  if (rawDraft !== undefined && !idSchema.safeParse(rawDraft).success) {
    return redirect({ href: "/assessments/new", locale });
  }
  const draftId = rawDraft;

  if (draftId) {
    const loaded = await withUser(user.id, async (tx) => {
      const d = await service.getDraft(tx, user.id, draftId);
      if (!d.ok) return d;
      const ctx = await service.getWizardContext(tx, user.id, d.data.header.plantId);
      return ctx.ok ? { ok: true as const, draft: d.data, context: ctx.data } : ctx;
    });
    if (!loaded.ok) {
      if (loaded.error === "alreadyApproved") return redirect({ href: `/assessments/${draftId}`, locale });
      return redirect({ href: "/assessments/new", locale });
    }
    const stepParam = Number(first(sp.step));
    const step = clampStep(Number.isFinite(stepParam) ? stepParam : null, loaded.draft);
    return (
      <Wizard
        key={draftId}
        plants={plants.map((p) => ({ id: p.id, name: p.name }))}
        defaultPlantId={loaded.draft.header.plantId}
        userName={user.name}
        nowIso={new Date().toISOString()}
        initial={{ draft: loaded.draft, context: loaded.context }}
        initialStep={step}
      />
    );
  }

  if (plants.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t("title")} />
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState
            icon={Factory}
            title={t("empty.title")}
            text={t("empty.text")}
            action={
              <Link href="/plants?new=1" className={buttonVariants({ size: "lg" })}>{t("empty.cta")}</Link>
            }
          />
        </div>
      </div>
    );
  }

  const wanted = first(sp.plant);
  const plantId =
    plants.find((p) => p.id === wanted)?.id ??
    plants.find((p) => p.id === filters.plantId)?.id ??
    plants[0].id;

  return (
    <Wizard
      key="new"
      plants={plants.map((p) => ({ id: p.id, name: p.name }))}
      defaultPlantId={plantId}
      userName={user.name}
      nowIso={new Date().toISOString()}
      initial={null}
      initialStep={1}
    />
  );
}
