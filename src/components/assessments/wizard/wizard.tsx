"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Save, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import {
  approveAssessmentAction,
  createDraftAction,
  deleteDraftAction,
  getWizardContextAction,
  saveDraftReadingsAction,
  setDraftSelectionAction,
  updateDraftDetailsAction,
} from "@/lib/assessments/actions";
import type { AssessmentFailure, ConflictingAssessment, FieldErrors } from "@/lib/assessments/schemas";
import type { DraftDto, WizardContext } from "@/lib/assessments/types";
import { DeleteDraftDialog } from "./delete-draft-dialog";
import {
  allIndicators,
  canApprove,
  countStates,
  defaultDetails,
  detailsErrors,
  emptyReading,
  evaluateAll,
  periodLabel,
  readingFromServer,
  type Details,
  type ReadingState,
  type Step,
} from "./lib";
import { Stepper } from "./stepper";
import { StepDetails } from "./step-details";
import { StepIndicators } from "./step-indicators";
import { StepReadings } from "./step-readings";
import { StepReview } from "./step-review";

type Props = {
  plants: { id: string; name: string }[];
  defaultPlantId: string;
  userName: string;
  /** server clock, so the month options match the server's rules */
  nowIso: string;
  initial: { draft: DraftDto; context: WizardContext } | null;
  initialStep: Step;
};

type Conflict = { kind: "duplicate" | "overlap"; with?: ConflictingAssessment };

function detailsOfDraft(h: DraftDto["header"]): Details {
  return {
    plantId: h.plantId,
    periodStart: h.periodStart,
    months: h.months,
    startDate: h.startDate,
    endDate: h.endDate,
    enteredBy: h.enteredBy,
  };
}

function readingsOfDraft(draft: DraftDto, context: WizardContext): Record<string, ReadingState> {
  const byRef = new Map(allIndicators(context.groups).map((i) => [i.ref, i]));
  const out: Record<string, ReadingState> = {};
  for (const r of draft.readings) {
    const ind = byRef.get(r.ref);
    if (ind) out[r.ref] = readingFromServer(ind, r.inputs, r.note);
  }
  return out;
}

export function Wizard({ plants, defaultPlantId, userName, nowIso, initial, initialStep }: Props) {
  const t = useTranslations("wizard");
  const locale = useLocale();
  const router = useRouter();
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const [step, setStep] = useState<Step>(initialStep);
  const [draftId, setDraftId] = useState<string | null>(initial?.draft.header.id ?? null);
  const [details, setDetails] = useState<Details>(() =>
    initial ? detailsOfDraft(initial.draft.header) : defaultDetails(defaultPlantId, userName, now),
  );
  const savedDetails = useRef<string>(initial ? JSON.stringify(detailsOfDraft(initial.draft.header)) : "");
  const [context, setContext] = useState<WizardContext | null>(initial?.context ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.draft.selection ?? []));
  const [readings, setReadings] = useState<Record<string, ReadingState>>(() =>
    initial ? readingsOfDraft(initial.draft, initial.context) : {},
  );
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const focusRef = useRef<string | null>(null);

  const selectedInds = useMemo(
    () => (context ? allIndicators(context.groups).filter((i) => selected.has(i.ref)) : []),
    [context, selected],
  );
  const rows = useMemo(() => evaluateAll(selectedInds, readings), [selectedInds, readings]);
  const counts = useMemo(() => countStates(rows), [rows]);
  const localErrors = useMemo(() => detailsErrors(details, now), [details, now]);
  const shownErrors: FieldErrors = showErrors ? { ...localErrors, ...serverErrors } : serverErrors;

  // URL carries draft + step (no navigation, no server round trip). A server action's refresh makes
  // Next restore its own copy of the URL a moment later, so it is re-applied when that happens.
  const search = useSearchParams().toString();
  const applyUrl = useCallback(() => {
    if (!draftId) return;
    const want = `?draft=${draftId}&step=${step}`;
    if (window.location.search !== want) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${want}`);
    }
  }, [draftId, step]);
  useEffect(() => {
    applyUrl();
    // late refresh after a save
    const timers = [250, 1000].map((ms) => window.setTimeout(applyUrl, ms));
    return () => timers.forEach(window.clearTimeout);
  }, [applyUrl, search]);

  // focus: the step heading on a step change, or the offending card when asked
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (focusRef.current) {
      const card = document.querySelector<HTMLElement>(`[data-reading="${CSS.escape(focusRef.current)}"]`);
      const target = card?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? card?.querySelector<HTMLElement>("input");
      if (card) {
        card.scrollIntoView({ block: "center" });
        target?.focus({ preventScroll: true });
        focusRef.current = null;
        return;
      }
    }
    document.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  // unsaved input guard
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const fail = useCallback((res: AssessmentFailure) => {
    setConflict(null);
    setServerErrors({});
    if (res.error === "duplicate" || res.error === "overlap") {
      setConflict({ kind: res.error, with: res.conflict });
      setFormError(null);
    } else if (res.error === "validation" || res.error === "futurePeriod") {
      setServerErrors(res.fieldErrors ?? {});
      setFormError("summary");
    } else {
      setFormError(res.error);
    }
  }, []);

  const payload = useCallback(
    (d: Details) => ({
      plantId: d.plantId,
      periodStart: d.periodStart,
      months: d.months,
      startDate: d.startDate,
      endDate: d.endDate,
      enteredBy: d.enteredBy,
    }),
    [],
  );

  const syncFromDraft = useCallback(
    (draft: DraftDto, ctx: WizardContext) => {
      setSelected(new Set(draft.selection));
      setReadings((prev) => {
        const fromServer = readingsOfDraft(draft, ctx);
        const next: Record<string, ReadingState> = {};
        for (const ref of draft.selection) next[ref] = prev[ref] ?? fromServer[ref];
        return next;
      });
    },
    [],
  );

  /** Step 1 -> server. Returns the context of the chosen plant, or null on failure. */
  const persistDetails = useCallback(async (): Promise<WizardContext | null> => {
    setShowErrors(true);
    if (Object.keys(localErrors).length) return null;
    setServerErrors({});
    setConflict(null);
    setFormError(null);
    let draft: DraftDto | null = null;
    let id = draftId;
    if (!id) {
      const res = await createDraftAction(payload(details));
      if (!res.ok) return fail(res), null;
      id = res.data.id;
      setDraftId(id);
      savedDetails.current = JSON.stringify(details);
    } else if (savedDetails.current !== JSON.stringify(details)) {
      const res = await updateDraftDetailsAction(id, payload(details));
      if (!res.ok) return fail(res), null;
      draft = res.data;
      savedDetails.current = JSON.stringify(details);
    }
    let ctx = context;
    if (!ctx || ctx.plant.id !== details.plantId) {
      const res = await getWizardContextAction(details.plantId);
      if (!res.ok) return fail(res), null;
      ctx = res.data;
      setContext(ctx);
      if (draft) {
        syncFromDraft(draft, ctx);
      } else {
        // a draft just created: the server selected every adopted indicator (empty inputs)
        setSelected(new Set(allIndicators(ctx.groups).map((i) => i.ref)));
        setReadings({});
      }
    } else if (draft) {
      syncFromDraft(draft, ctx);
    }
    setDirty(false);
    return ctx;
  }, [context, details, draftId, fail, localErrors, payload, syncFromDraft]);

  const persistSelection = useCallback(async (): Promise<boolean> => {
    if (!draftId || !context) return false;
    const res = await setDraftSelectionAction({ id: draftId, refs: [...selected] });
    if (!res.ok) return fail(res), false;
    syncFromDraft(res.data, context);
    setDirty(false);
    return true;
  }, [context, draftId, fail, selected, syncFromDraft]);

  const persistReadings = useCallback(async (): Promise<boolean> => {
    if (!draftId) return false;
    const body: Record<string, { inputs: Record<string, string>; note: string }> = {};
    for (const i of selectedInds) {
      const r = readings[i.ref] ?? emptyReading(i);
      body[i.ref] = { inputs: r.inputs, note: r.note };
    }
    const res = await saveDraftReadingsAction({ id: draftId, readings: body });
    if (!res.ok) return fail(res), false;
    setDirty(false);
    return true;
  }, [draftId, fail, readings, selectedInds]);

  /** Saves whatever the current step holds. */
  const persistCurrent = useCallback(async (): Promise<boolean> => {
    setFormError(null);
    if (step === 1) return (await persistDetails()) !== null || !draftId;
    if (step === 2) return persistSelection();
    return persistReadings();
  }, [draftId, persistDetails, persistReadings, persistSelection, step]);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const next = () =>
    run(async () => {
      if (step === 1) {
        const ctx = await persistDetails();
        if (ctx) setStep(2);
      } else if (step === 2) {
        if (selected.size === 0) return setFormError("noIndicatorsSelected");
        if (await persistSelection()) setStep(3);
      } else if (step === 3) {
        if (await persistReadings()) setStep(4);
      }
    });

  const back = () =>
    run(async () => {
      if (step === 1) return;
      // step 1's details are saved on the way forward; going back from 2/3/4 saves that step
      if (step === 2 && !(await persistSelection())) return;
      if (step === 3 && !(await persistReadings())) return;
      setFormError(null);
      setStep((step - 1) as Step);
    });

  const goToDone = (target: Step) =>
    run(async () => {
      if (target >= step) return;
      if (step === 2 && !(await persistSelection())) return;
      if (step === 3 && !(await persistReadings())) return;
      setFormError(null);
      setStep(target);
    });

  const saveDraft = () =>
    run(async () => {
      if (!(await persistCurrent())) return;
      setDirty(false);
      toast.success(t("toast.draftSaved"));
      router.push("/assessments");
    });

  const approve = () =>
    run(async () => {
      if (!draftId || !canApprove(counts, ack)) return;
      if (!(await persistReadings())) return;
      const res = await approveAssessmentAction({ id: draftId, acknowledgeMissing: ack });
      if (!res.ok) {
        fail(res);
        if (res.error === "inputErrors" && "refs" in res) {
          setStep(3);
          focusRef.current = res.refs[0] ?? null;
        }
        return;
      }
      setDirty(false);
      setProcessing(true);
      router.push(`/assessments/${res.data.id}`);
    });

  const remove = async () => {
    if (!draftId) return;
    const res = await deleteDraftAction(draftId);
    if (!res.ok) {
      setDeleteOpen(false);
      return fail(res);
    }
    setDirty(false);
    setDeleteOpen(false);
    toast.success(t("toast.draftDeleted"));
    router.push("/assessments");
  };

  const editReading = (ref: string) => {
    focusRef.current = ref;
    setStep(3);
  };

  const plantName = context?.plant.name ?? plants.find((p) => p.id === details.plantId)?.name ?? "";
  const period = periodLabel(details.periodStart, details.months, locale);
  const incomplete = counts.partial + counts.missing;
  const nextLabel = { 1: t("actions.nextIndicators"), 2: t("actions.nextReadings"), 3: t("actions.nextReview"), 4: "" }[step];
  const Fwd = locale === "ar" ? ArrowLeft : ArrowRight;
  const Bwd = locale === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("title")}
        actions={
          draftId ? (
            <Button variant="outline" size="lg" className="h-9" onClick={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden="true" />
              {t("actions.deleteDraft")}
            </Button>
          ) : undefined
        }
      />
      <p className="-mt-2 text-sm text-fg-3">
        {t("eyebrow")}
        {draftId ? ` · ${t("draftBadge")}` : ""}
      </p>

      <Stepper step={step} canGoBackTo={(n) => n < step && !busy} onGo={goToDone} />

      {formError ? (
        <Alert variant="destructive" role="alert" data-testid="wizard-error">
          <AlertDescription>{t(`errors.${formError}` as never)}</AlertDescription>
        </Alert>
      ) : null}

      {step === 1 ? (
        <StepDetails
          plants={plants}
          details={details}
          onChange={(d) => {
            setDetails(d);
            setDirty(true);
            setConflict(null);
            setServerErrors({});
            setFormError(null);
          }}
          errors={shownErrors}
          conflict={conflict}
          now={now}
        />
      ) : null}
      {step === 2 && context ? (
        <StepIndicators
          context={context}
          selected={selected}
          onChange={(s) => {
            setSelected(s);
            setDirty(true);
            setFormError(null);
          }}
        />
      ) : null}
      {step === 3 ? (
        <StepReadings
          rows={rows}
          desc={`${plantName} · ${period} — ${t("readings.desc")}`}
          onChange={(ref, r) => {
            setReadings((prev) => ({ ...prev, [ref]: r }));
            setDirty(true);
            setFormError(null);
          }}
        />
      ) : null}
      {step === 4 && context ? (
        <StepReview
          plantName={plantName}
          details={details}
          groups={context.groups}
          rows={rows}
          ack={ack}
          onAck={setAck}
          onEdit={editReading}
        />
      ) : null}

      <div
        role="group"
        aria-label={t("stepper.label")}
        className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-(--glass) p-2.5 shadow-(--shadow-card) backdrop-blur-xl lg:bottom-3"
      >
        {step > 1 ? (
          <Button variant="outline" size="lg" className="h-10 max-sm:px-3" onClick={back} disabled={busy}>
            <Bwd aria-hidden="true" />
            <span className="max-sm:sr-only">{t("actions.back")}</span>
          </Button>
        ) : null}
        <p className={`min-w-[8rem] flex-1 text-[13px] text-muted-foreground max-sm:order-first max-sm:basis-full ${step === 2 ? "" : "max-sm:hidden"}`}>
          {step === 1
            ? t("bar.context", { plant: plantName, period })
            : step === 2
              ? t("indicators.selectedCount", { count: selected.size })
              : step === 3 || step === 4
                ? step === 4
                  ? t("review.summary", { complete: counts.complete, missing: incomplete, errors: counts.error })
                  : incomplete
                    ? t("bar.incomplete", { count: incomplete })
                    : t("bar.allComplete")
                : null}
        </p>
        {step >= 3 ? (
          <Button variant="outline" size="lg" className="h-10 max-sm:px-3" onClick={saveDraft} disabled={busy}>
            <Save aria-hidden="true" />
            <span className="max-sm:sr-only">{t("actions.saveDraft")}</span>
          </Button>
        ) : null}
        {step < 4 ? (
          <Button size="lg" className="h-10 max-sm:min-w-0 max-sm:flex-1" onClick={next} disabled={busy || (step === 2 && selected.size === 0)}>
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {nextLabel}
            {!busy ? <Fwd aria-hidden="true" /> : null}
          </Button>
        ) : (
          <Button size="lg" className="h-10 max-sm:min-w-0 max-sm:flex-1" onClick={approve} disabled={busy || !canApprove(counts, ack)}>
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
            {t("actions.approve")}
          </Button>
        )}
      </div>

      <DeleteDraftDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={remove} />

      {processing ? (
        <div
          role="status"
          data-testid="wizard-processing"
          className="fixed inset-0 z-[60] grid place-items-center bg-background/85 backdrop-blur-sm"
        >
          <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
            <Loader2 aria-hidden="true" className="size-9 animate-spin text-primary motion-reduce:animate-none" />
            <p className="text-lg font-bold">{t("processing.title")}</p>
            <p className="text-sm text-muted-foreground">{t("processing.text")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
