/**
 * Creates the demo account (engineer@wtp.iq / demo1234) with three plants and monthly
 * assessments Mar-Aug 2026. Idempotent: an existing account with the same email is
 * deleted (everything it owns cascades) and recreated.
 *
 *   npm run db:seed:demo            (tsx scripts/seed-demo.ts)
 *
 * Runs as the OWNER role (scripts only). The assessments go through the real service code
 * (src/lib/assessments/service.ts) with historical `now` values, so values, statuses,
 * limit snapshots, audit events and auto problems are produced by the real code path. The
 * owner role is exempt from row-level security and from the "approved is final" triggers,
 * which is why this can run as a script; the service itself never relies on that.
 *
 * Needs the reference data: run `npm run db:seed` first.
 */
import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { hashPassword } from "better-auth/crypto";
import type { Client } from "pg";
import * as schema from "@/db/schema";
import { accounts, plantIndicators, plants, problemObstacles, problems, users } from "@/db/schema";
import type { UserTx } from "@/db/with-user";
import * as assessmentsSvc from "@/lib/assessments/service";
import type { AssessmentResult } from "@/lib/assessments/schemas";
import type { Limits, Method } from "@/lib/evaluation";
import { ensureDefaultLimits, saveLimits } from "@/lib/indicators/service";
import {
  DEMO_EMAIL,
  DEMO_JOB_TITLE,
  DEMO_LOCALE,
  DEMO_NAME,
  DEMO_PASSWORD,
  DEMO_PLANTS,
  DIJLA_PROBLEM,
  FIRST_V11_MONTH,
  HIST,
  SERIES,
  WQ02_V10,
  WQ02_V11,
  entryTimes,
  rawInputsFor,
  type DemoPlantKey,
} from "./lib/demo-data";
import { connectAsOwner } from "./lib/owner-db";

export type SeedDemoOptions = {
  /** default: the real demo account. Tests pass a throwaway email. */
  email?: string;
  password?: string;
  name?: string;
  /** use an existing owner connection instead of opening (and closing) one */
  client?: Client;
};

export type SeedDemoResult = {
  userId: string;
  email: string;
  plantIds: Record<DemoPlantKey, string>;
  /** `${plantKey}:${'YYYY-MM'}` -> assessment id */
  assessmentIds: Record<string, string>;
  problemId: string;
};

function must<T>(r: AssessmentResult<T>, what: string): T {
  if (!r.ok) throw new Error(`${what} failed: ${JSON.stringify(r)}`);
  return r.data;
}

async function setWq02(tx: UserTx, userId: string, limits: Limits): Promise<void> {
  const r = await saveLimits(tx, userId, { kind: "sys", code: "WQ-02" }, { none: false, limits });
  if (!r.ok) throw new Error(`saving the WQ-02 limits failed: ${JSON.stringify(r)}`);
}

export async function seedDemo(options: SeedDemoOptions = {}): Promise<SeedDemoResult> {
  const email = options.email ?? DEMO_EMAIL;
  const password = options.password ?? DEMO_PASSWORD;
  const name = options.name ?? DEMO_NAME;
  const client = options.client ?? (await connectAsOwner());
  try {
    await client.query("BEGIN");
    try {
      const result = await run(client, { email, password, name });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    if (!options.client) await client.end();
  }
}

async function run(
  client: Client,
  who: { email: string; password: string; name: string },
): Promise<SeedDemoResult> {
  const db = drizzle(client, { schema });
  const tx = db as unknown as UserTx;

  // --- the account (users + accounts, with Better Auth's own password hash) ---------------
  await db.delete(users).where(eq(users.email, who.email));
  const [user] = await db
    .insert(users)
    .values({
      name: who.name,
      email: who.email,
      emailVerified: true,
      jobTitle: DEMO_JOB_TITLE,
      locale: DEMO_LOCALE,
    })
    .returning({ id: users.id });
  const userId = user.id;
  await db.insert(accounts).values({
    userId,
    accountId: userId,
    providerId: "credential",
    password: await hashPassword(who.password),
  });

  // --- plants and adoption ----------------------------------------------------------------
  const systemCodes = (await client.query<{ code: string }>("select code from indicators")).rows.map(
    (r) => r.code,
  );
  if (systemCodes.length !== 15) {
    throw new Error("Reference data is missing: run `npm run db:seed` first.");
  }
  const methodOf = new Map(
    (await client.query<{ code: string; method: Method }>("select code, method from indicators")).rows.map(
      (r) => [r.code, r.method],
    ),
  );

  const plantIds = {} as Record<DemoPlantKey, string>;
  for (const p of DEMO_PLANTS) {
    const [row] = await db
      .insert(plants)
      .values({
        ownerId: userId,
        name: p.name,
        governorate: p.governorate,
        location: p.location,
        waterSource: p.waterSource,
        designCapacity: p.designCapacity,
        actualCapacity: p.actualCapacity,
        engineer: p.engineer,
      })
      .returning({ id: plants.id });
    plantIds[p.key] = row.id;
    await db.insert(plantIndicators).values(
      systemCodes.map((code) => ({
        ownerId: userId,
        plantId: row.id,
        indicatorCode: code,
        adopted: !p.notAdopted.includes(code),
      })),
    );
  }

  // --- limits version 1.0, then 1.1 from July ---------------------------------------------
  await ensureDefaultLimits(tx, userId);
  await setWq02(tx, userId, WQ02_V10);

  // --- monthly assessments: through the real service ---------------------------------------
  const assessmentIds: Record<string, string> = {};
  for (let mi = 0; mi < HIST.length; mi++) {
    const month = HIST[mi];
    if (month === FIRST_V11_MONTH) {
      await setWq02(tx, userId, WQ02_V11);
    }
    for (let pi = 0; pi < DEMO_PLANTS.length; pi++) {
      const plant = DEMO_PLANTS[pi];
      const { enteredAt, approvedAt } = entryTimes(month, pi, mi);
      const entered = { now: enteredAt, actor: plant.engineer };
      const { id } = must(
        await assessmentsSvc.createDraft(
          tx,
          userId,
          { plantId: plantIds[plant.key], periodStart: month, months: 1, enteredBy: plant.engineer },
          entered,
        ),
        `draft ${plant.key} ${month}`,
      );
      const series = SERIES[plant.key];
      const refs = Object.keys(series).map((code) => `sys:${code}`);
      must(await assessmentsSvc.setDraftSelection(tx, userId, id, refs), `selection ${plant.key} ${month}`);
      const readings: Record<string, { inputs: Record<string, string | number | null> }> = {};
      for (const [code, values] of Object.entries(series)) {
        const method = methodOf.get(code) as Method;
        readings[`sys:${code}`] = { inputs: rawInputsFor(code, method, values[mi]) };
      }
      must(await assessmentsSvc.saveDraftReadings(tx, userId, id, readings), `readings ${plant.key} ${month}`);
      must(
        await assessmentsSvc.approveAssessment(tx, userId, id, {
          acknowledgeMissing: true, // Dijla WQ-03 has no March reading in the prototype
          now: approvedAt,
          actor: who.name,
        }),
        `approve ${plant.key} ${month}`,
      );
      assessmentIds[`${plant.key}:${month}`] = id;
    }
  }

  // --- Dijla: the open manual problem on RT-03 (Aug 2026) with obstacle O-26 "possible" ------
  const dijlaAug = assessmentIds[`dijla:${DIJLA_PROBLEM.month}`];
  const { problemId } = must(
    await assessmentsSvc.openManualProblem(tx, userId, dijlaAug, DIJLA_PROBLEM.ref, {
      now: DIJLA_PROBLEM.openedAt,
      actor: who.name,
    }),
    "manual problem",
  );
  await db.update(problems).set({ description: DIJLA_PROBLEM.description }).where(eq(problems.id, problemId));
  await db.insert(problemObstacles).values({
    ownerId: userId,
    problemId,
    obstacleCode: DIJLA_PROBLEM.obstacleCode,
    classification: DIJLA_PROBLEM.classification,
    note: DIJLA_PROBLEM.obstacleNote,
  });

  return { userId, email: who.email, plantIds, assessmentIds, problemId };
}

async function main() {
  const r = await seedDemo();
  console.log(`Demo account ready: ${r.email} / ${DEMO_PASSWORD}`);
  console.log(`  plants: ${Object.keys(r.plantIds).length}, assessments: ${Object.keys(r.assessmentIds).length}`);
  console.log(`  manual problem on Dijla RT-03 (Aug 2026): ${r.problemId}`);
}

const invokedDirectly =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
