import * as z from "zod";
import { parseNumber } from "@/lib/evaluation/number";
import {
  GOVERNORATES,
  MAX_ACTUAL_TO_DESIGN,
  WATER_SOURCES,
} from "./constants";

/**
 * Shared by the server actions and the add / edit form.
 * Messages are translation codes (plants.errors.<code>), never display text.
 */
export type PlantErrorCode =
  | "nameRequired"
  | "governorateRequired"
  | "locationRequired"
  | "sourceRequired"
  | "designRequired"
  | "designInvalid"
  | "actualInvalid"
  | "actualTooHigh"
  | "tooLong";

const MAX_TEXT = 200;
const MAX_NOTES = 2000;

const required = (code: PlantErrorCode) =>
  z.string(code).trim().min(1, code).max(MAX_TEXT, "tooLong");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .optional()
    .transform((v) => v ?? "");

/** Form value to number: blank is null, anything unparseable is NaN. */
export const toNumber = (v: unknown): number | null => parseNumber(v);

/** A missing key behaves like a blank field. */
const blankIfMissing = z.preprocess((v) => v ?? "", z.unknown());

const oneOf = <T extends readonly [string, ...string[]]>(
  values: T,
  code: PlantErrorCode,
) => z.string(code).trim().pipe(z.enum(values, code));

export const plantInputSchema = z
  .object({
    name: required("nameRequired"),
    governorate: oneOf(GOVERNORATES, "governorateRequired"),
    location: required("locationRequired"),
    waterSource: oneOf(WATER_SOURCES, "sourceRequired"),
    designCapacity: blankIfMissing.transform((v, ctx) => {
      const n = toNumber(v);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: "designRequired" });
        return z.NEVER;
      }
      if (Number.isNaN(n) || n <= 0) {
        ctx.addIssue({ code: "custom", message: "designInvalid" });
        return z.NEVER;
      }
      return n;
    }),
    actualCapacity: blankIfMissing.transform((v, ctx): number | null => {
      const n = toNumber(v);
      if (n === null) return null;
      if (Number.isNaN(n) || n < 0) {
        ctx.addIssue({ code: "custom", message: "actualInvalid" });
        return z.NEVER;
      }
      return n;
    }),
    engineer: optionalText(MAX_TEXT),
    notes: optionalText(MAX_NOTES),
  })
  .superRefine((v, ctx) => {
    if (
      v.actualCapacity !== null &&
      v.actualCapacity > v.designCapacity * MAX_ACTUAL_TO_DESIGN
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["actualCapacity"],
        message: "actualTooHigh",
      });
    }
  });

export type PlantInput = z.output<typeof plantInputSchema>;

/** Raw form values (strings), as the client form and FormData provide them. */
export type PlantFormValues = {
  name: string;
  governorate: string;
  location: string;
  waterSource: string;
  designCapacity: string;
  actualCapacity: string;
  engineer: string;
  notes: string;
};

export type PlantFieldErrors = Partial<Record<keyof PlantFormValues, PlantErrorCode>>;

/** First error code per field. A missing/NaN-typed design capacity etc. is mapped by the schema. */
export function plantFieldErrors(error: z.ZodError): PlantFieldErrors {
  const out: PlantFieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "name") as keyof PlantFormValues;
    if (!(key in out)) out[key] = issue.message as PlantErrorCode;
  }
  return out;
}

export function validatePlant(raw: unknown):
  | { ok: true; data: PlantInput }
  | { ok: false; fieldErrors: PlantFieldErrors } {
  const parsed = plantInputSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, fieldErrors: plantFieldErrors(parsed.error) };
}
