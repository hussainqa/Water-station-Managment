"use client";

import { useState, useTransition } from "react";
import { CircleAlert } from "lucide-react";
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
import { deleteDraftAction } from "@/lib/assessments/actions";

type Props = { id: string; plant: string; period: string; open: boolean; onOpenChange: (o: boolean) => void };

export function DeleteDraftDialog({ id, plant, period, open, onOpenChange }: Props) {
  const t = useTranslations("assessments.list.deleteDialog");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function confirm() {
    setError(false);
    startTransition(async () => {
      const r = await deleteDraftAction(id);
      if (r.ok) {
        onOpenChange(false);
      } else {
        setError(true);
        toast.error(t("failed"));
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="default" className="gap-3 p-5">
        <AlertDialogTitle className="flex items-center gap-2 font-heading text-base font-bold">
          <CircleAlert aria-hidden="true" className="size-5 text-critical" />
          {t("title")}
        </AlertDialogTitle>
        <AlertDialogDescription className="text-sm">{t("text", { plant, period })}</AlertDialogDescription>
        {error ? (
          <p role="alert" className="text-[13.5px] text-critical">
            {t("failed")}
          </p>
        ) : null}
        <AlertDialogFooter className="-mx-5 -mb-5 mt-1 px-5 py-4">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)} className="h-10 rounded-[11px] px-5">
            {t("cancel")}
          </Button>
          <Button type="button" variant="destructive" data-testid="confirm-delete-draft" disabled={pending} aria-busy={pending} onClick={confirm} className="h-10 rounded-[11px] px-5">
            {t("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
