"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Factory, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { setFilters } from "@/lib/context/actions";
import { setAdoptionAction } from "@/lib/indicators/actions";
import type { IndicatorsData } from "@/lib/indicators/types";
import { cn } from "cn";
import { DeleteGroupDialog, DeleteIndicatorDialog, RenameGroupDialog } from "./confirm-dialogs";
import { nativeSelect } from "./form-bits";
import { localName } from "./format";
import { IndicatorCard } from "./indicator-card";
import { IndicatorFormDialog } from "./indicator-form-dialog";
import { LimitsDialog } from "./limits-dialog";

type Props = {
  data: IndicatorsData;
  plants: { id: string; name: string }[];
  /** Plant the adoption switches refer to (?plant=, else the top-bar plant), or null. */
  plantId: string | null;
  /** The plant chosen in the top bar: the picker follows it, and picking here sets it. */
  topBarPlantId?: string | null;
};

const ALL = "all";

export function IndicatorsView({ data, plants, plantId, topBarPlantId = null }: Props) {
  const t = useTranslations("indicators");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [filter, setFilter] = useState<string>(ALL);
  const [limitsRef, setLimitsRef] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editRef, setEditRef] = useState<string | null>(null);
  const [deleteRef, setDeleteRef] = useState<string | null>(null);
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [deleteGroupKey, setDeleteGroupKey] = useState<string | null>(null);

  const plant = plants.find((p) => p.id === plantId) ?? null;

  // Optimistic adoption: flips at once, falls back by itself if the action fails.
  const adoptedBase = useMemo(
    () => Object.fromEntries(data.indicators.map((i) => [i.ref, i.adopted])) as Record<string, boolean>,
    [data.indicators],
  );
  const [adoptedMap, setOptimistic] = useOptimistic(
    adoptedBase,
    (state, change: { ref: string; adopted: boolean }) => ({ ...state, [change.ref]: change.adopted }),
  );

  function toggleAdoption(ref: string, adopted: boolean) {
    if (!plant) return;
    startTransition(async () => {
      setOptimistic({ ref, adopted });
      const res = await setAdoptionAction({ plantId: plant.id, ref, adopted });
      if (!res.ok) toast.error(t(`errors.${res.error}`));
    });
  }

  // The picker is the top-bar selection, not a second one: choosing here sets the top bar,
  // and a change in the top bar drops an explicit ?plant= so the page follows it.
  function pickPlant(id: string) {
    startTransition(async () => {
      const r = await setFilters({ plantId: id || null });
      if (!r.ok) toast.error(t("errors.generic"));
      router.replace(pathname);
    });
  }
  const lastTopBar = useRef(topBarPlantId);
  useEffect(() => {
    if (lastTopBar.current === topBarPlantId) return;
    lastTopBar.current = topBarPlantId;
    if (plantId !== topBarPlantId) router.replace(pathname);
  }, [topBarPlantId, plantId, pathname, router]);

  const find = (ref: string | null) => (ref ? (data.indicators.find((i) => i.ref === ref) ?? null) : null);
  const group = (key: string | null) => (key ? (data.groups.find((g) => g.key === key) ?? null) : null);

  const activeFilter = filter === ALL || data.groups.some((g) => g.key === filter) ? filter : ALL;
  const visibleGroups = data.groups.filter((g) => activeFilter === ALL || g.key === activeFilter);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button
            type="button"
            onClick={() => {
              setEditRef(null);
              setFormOpen(true);
            }}
            className="h-11 rounded-[11px] px-4 text-[15px]"
          >
            <Plus aria-hidden="true" />
            {t("add")}
          </Button>
        }
      />

      <section className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="group"
            aria-label={t("filter.label")}
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {[{ key: ALL, label: t("filter.all"), count: data.indicators.length }].concat(
              data.groups.map((g) => ({ key: g.key, label: localName(g, locale), count: g.count })),
            ).map((c) => (
              <button
                key={c.key}
                type="button"
                data-testid="group-chip"
                aria-pressed={activeFilter === c.key}
                onClick={() => setFilter(c.key)}
                className={cn(
                  "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  activeFilter === c.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-line-2 bg-card text-foreground/80 hover:bg-muted",
                )}
              >
                {c.label}
                <span className="num text-[12px] opacity-70">{c.count}</span>
              </button>
            ))}
          </div>

          <div className="min-w-0 lg:w-[300px] lg:shrink-0">
            {plants.length ? (
              <select
                aria-label={t("plant.label")}
                data-testid="plant-picker"
                value={plant?.id ?? ""}
                onChange={(e) => pickPlant(e.target.value)}
                className={cn(nativeSelect, "h-10 text-[13.5px]")}
              >
                {!plant ? <option value="">{t("plant.choose")}</option> : null}
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t("plant.adoptionAt", { plant: p.name })}
                  </option>
                ))}
              </select>
            ) : (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                <span>{t("plant.none")}</span>
                <Link href="/plants" className="font-semibold text-primary underline-offset-4 hover:underline">
                  {t("plant.addPlant")}
                </Link>
              </p>
            )}
          </div>
        </div>

        {plants.length && !plant ? (
          <p data-testid="plant-prompt" className="mt-3 flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-[13.5px] text-accent-foreground">
            <Factory aria-hidden="true" className="size-4 shrink-0" />
            {t("plant.prompt")}
          </p>
        ) : null}

        <div className="mt-2">
          {visibleGroups.map((g) => {
            const list = data.indicators.filter((i) => i.groupKey === g.key);
            return (
              <section key={g.key} data-testid="indicator-group" data-group={g.key} aria-label={localName(g, locale)} className="mt-5 first:mt-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-2">
                  <h3 className="text-base font-semibold">{localName(g, locale)}</h3>
                  <span className="text-[12.5px] text-fg-3">{t("group.count", { count: list.length })}</span>
                  {!g.isSystem ? (
                    <>
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-medium text-accent-foreground">
                        {t("group.userTag")}
                      </span>
                      <span className="ms-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setRenameKey(g.key)}
                          aria-label={`${t("group.rename")}: ${localName(g, locale)}`}
                          title={t("group.rename")}
                          className="size-8"
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={list.length ? undefined : () => setDeleteGroupKey(g.key)}
                          aria-disabled={list.length ? true : undefined}
                          aria-label={`${t("group.delete")}: ${localName(g, locale)}`}
                          title={list.length ? t("group.deleteBlocked") : t("group.delete")}
                          className={cn("size-8", list.length ? "cursor-not-allowed opacity-50" : "text-critical hover:text-critical")}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </span>
                    </>
                  ) : null}
                </div>
                {list.length ? (
                  list.map((i) => (
                    <IndicatorCard
                      key={i.ref}
                      indicator={i}
                      plant={plant}
                      adopted={adoptedMap[i.ref] ?? false}
                      onAdoptedChange={(v) => toggleAdoption(i.ref, v)}
                      onLimits={() => setLimitsRef(i.ref)}
                      onEdit={() => {
                        setEditRef(i.ref);
                        setFormOpen(true);
                      }}
                      onDelete={() => setDeleteRef(i.ref)}
                    />
                  ))
                ) : (
                  <p className="py-3 text-[13px] text-fg-3">{t("group.empty")}</p>
                )}
              </section>
            );
          })}
        </div>
      </section>

      <LimitsDialog
        open={limitsRef !== null}
        onOpenChange={(o) => !o && setLimitsRef(null)}
        indicator={find(limitsRef)}
      />
      <IndicatorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        groups={data.groups}
        indicator={find(editRef)}
        defaultGroupKey={activeFilter === ALL ? undefined : activeFilter}
        onCreated={(key) => setFilter(key)}
      />
      <DeleteIndicatorDialog indicator={find(deleteRef)} onOpenChange={(o) => !o && setDeleteRef(null)} />
      <RenameGroupDialog group={group(renameKey)} onOpenChange={(o) => !o && setRenameKey(null)} />
      <DeleteGroupDialog
        group={group(deleteGroupKey)}
        onOpenChange={(o) => !o && setDeleteGroupKey(null)}
        onDeleted={() => setFilter(ALL)}
      />
    </>
  );
}
