"use client";

import { useId, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateReadingNoteAction } from "@/lib/assessments/actions";
import { NOTE_MAX } from "@/lib/assessments/schemas";

type Props = { assessmentId: string; refKey: string; initial: string };

/** The one thing an approved assessment still allows: the note of a reading. */
export function NoteEditor({ assessmentId, refKey, initial }: Props) {
  const t = useTranslations("assessments");
  const id = useId();
  const [saved, setSaved] = useState(initial);
  const [text, setText] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "saved" | "unchanged" | "error"; text: string } | null>(null);

  const dirty = text.trim() !== saved.trim();

  function save() {
    startTransition(async () => {
      const r = await updateReadingNoteAction({ id: assessmentId, ref: refKey, note: text });
      if (r.ok) {
        setSaved(r.data.note);
        setText(r.data.note);
        setMessage(
          r.data.changed
            ? { kind: "saved", text: t("drawer.noteSaved") }
            : { kind: "unchanged", text: t("drawer.noteUnchanged") },
        );
      } else {
        const fe = r.error === "validation" && r.fieldErrors?.note === "tooLong" ? "tooLong" : r.error;
        setMessage({ kind: "error", text: t.has(`errors.${fe}`) ? t(`errors.${fe}`) : t("errors.generic") });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {t("drawer.note")}
      </label>
      <Textarea
        id={id}
        data-testid="note-input"
        value={text}
        maxLength={NOTE_MAX}
        rows={3}
        placeholder={t("drawer.notePlaceholder")}
        onChange={(e) => {
          setText(e.target.value);
          setMessage(null);
        }}
        className="min-h-20 text-[14px]"
      />
      <p className="m-0 text-[12.5px] text-fg-3">{t("drawer.noteHint")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          data-testid="note-save"
          variant="secondary"
          disabled={pending || !dirty}
          aria-busy={pending}
          onClick={save}
          className="h-10 rounded-[11px] px-4 text-[14px]"
        >
          {pending ? t("drawer.noteSaving") : t("drawer.noteSave")}
        </Button>
        <p
          role="status"
          data-testid="note-status"
          className={
            message?.kind === "error"
              ? "m-0 flex items-center gap-1.5 text-[13px] font-medium text-critical"
              : "m-0 flex items-center gap-1.5 text-[13px] font-medium text-ok"
          }
        >
          {message ? (
            <>
              {message.kind !== "error" ? <Check aria-hidden="true" className="size-4" /> : null}
              {message.text}
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
