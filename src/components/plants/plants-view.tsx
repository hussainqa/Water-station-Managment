"use client";

import { useMemo, useState } from "react";
import { Factory, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { matchesPlant } from "@/lib/plants/state";
import { DeletePlantDialog } from "./delete-plant-dialog";
import { PlantCard, type PlantCardData } from "./plant-card";
import { PlantFormDialog } from "./plant-form-dialog";

type Props = {
  plants: PlantCardData[];
  /** /plants?new=1 (the dashboard's call to action) opens the add dialog */
  openNew?: boolean;
};

export function PlantsView({ plants, openNew = false }: Props) {
  const t = useTranslations("plants");
  const router = useRouter();
  const [query, setQuery] = useState("");
  // `target` stays set while the dialog animates out
  const [form, setForm] = useState<{ open: boolean; target: PlantCardData | null }>({
    open: openNew,
    target: null,
  });
  const [del, setDel] = useState<{ open: boolean; target: PlantCardData | null }>({
    open: false,
    target: null,
  });

  const visible = useMemo(
    () =>
      plants.filter((p) =>
        matchesPlant(query, [p.name, p.location, t(`governorates.${p.governorate}`), p.engineer]),
      ),
    [plants, query, t],
  );

  function openAdd() {
    setForm({ open: true, target: null });
  }

  function onFormOpenChange(open: boolean) {
    setForm((f) => ({ ...f, open }));
    if (!open && openNew) router.replace("/plants");
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Button type="button" onClick={openAdd} className="h-11 gap-2 rounded-[13px] px-5 text-[15px]">
            <Plus aria-hidden="true" className="size-[18px]" />
            {t("add")}
          </Button>
        }
      />

      {plants.length > 0 ? (
        <div className="relative mt-5 max-w-[420px]">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.label")}
            className="h-11 rounded-[13px] border-line-2 bg-card ps-10 pe-3 text-[15px] md:text-[15px]"
          />
        </div>
      ) : null}

      <div className="mt-5">
        {plants.length === 0 ? (
          <section className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
            <EmptyState
              icon={Factory}
              title={t("empty.title")}
              text={t("empty.text")}
              action={
                <Button type="button" onClick={openAdd} className="h-11 gap-2 rounded-[13px] px-5 text-[15px]">
                  <Plus aria-hidden="true" className="size-[18px]" />
                  {t("empty.cta")}
                </Button>
              }
            />
          </section>
        ) : visible.length === 0 ? (
          <section className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
            <EmptyState
              icon={Search}
              title={t("noResults.title")}
              text={t("noResults.text", { query: query.trim() })}
            />
          </section>
        ) : (
          <ul
            aria-label={t("list")}
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4"
          >
            {visible.map((p) => (
              <li key={p.id} className="flex min-w-0 [&>*]:flex-1">
                <PlantCard
                  plant={p}
                  onEdit={(plant) => setForm({ open: true, target: plant })}
                  onDelete={(plant) => setDel({ open: true, target: plant })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <PlantFormDialog open={form.open} onOpenChange={onFormOpenChange} plant={form.target} />
      <DeletePlantDialog
        open={del.open}
        plant={del.target}
        onOpenChange={(open) => setDel((d) => ({ ...d, open }))}
      />
    </>
  );
}
