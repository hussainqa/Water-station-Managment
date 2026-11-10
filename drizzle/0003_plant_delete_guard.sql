ALTER TABLE "assessments" DROP CONSTRAINT "assessments_plant_fk";
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_plant_fk" FOREIGN KEY ("plant_id","owner_id") REFERENCES "public"."plants"("id","owner_id") ON DELETE no action ON UPDATE no action;