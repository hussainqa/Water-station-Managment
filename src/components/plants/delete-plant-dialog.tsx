"use client";

import { useState, useTransition } from "react";
import { CircleAlert, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deletePlantAction } from "@/lib/plants/actions";
import type { PlantCardData } from "./plant-card";

type Props = {
  plant: PlantCardData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Confirmation before deleting. A plant with assessments cannot be deleted:
 * the dialog then only explains why (the card's delete control is aria-disabled).
 */
export function DeletePlantDialog({ plant, open, onOpenChange }: Props) {
  const t = useTranslations("plants");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const blocked = (plant?.assessmentCount ?? 0) > 0;

  function close(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  function confirm() {
    if (!plant) return;
    setError(null);
    startTransition(async () => {
      const r = await deletePlantAction(plant.id);
      if (r.ok) {
        toast.success(t("toast.deleted"));
        close(false);
      } else {
        setError(t(r.error === "notFound" || r.error === "hasAssessments" ? `errors.${r.error}` : "errors.deleteFailed"));
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent size="default" className="gap-3 p-5">
        <AlertDialogTitle className="flex items-center gap-2 font-heading text-base font-bold">
          {blocked ? (
            <Info aria-hidden="true" className="size-5 text-muted-foreground" />
          ) : (
            <CircleAlert aria-hidden="true" className="size-5 text-critical" />
          )}
          {t(blocked ? "delete.blockedTitle" : "delete.title")}
        </AlertDialogTitle>
        <AlertDialogDescription className="text-sm">
          {blocked ? t("delete.blocked") : t("delete.text", { name: plant?.name ?? "" })}
        </AlertDialogDescription>
        {error ? (
          <p role="alert" className="text-[13.5px] text-critical">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter className="-mx-5 -mb-5 mt-1 px-5 py-4">
          {blocked ? (
            <Button type="button" onClick={() => close(false)} className="h-10 rounded-[11px] px-5">
              {t("delete.ok")}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => close(false)}
                className="h-10 rounded-[11px] px-5"
              >
                {t("delete.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                aria-busy={pending}
                onClick={confirm}
                className="h-10 rounded-[11px] px-5"
              >
                {t("delete.confirm")}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
