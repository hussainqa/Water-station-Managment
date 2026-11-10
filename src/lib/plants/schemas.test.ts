import { describe, expect, it } from "vitest";
import { validatePlant } from "./schemas";

const valid = {
  name: "Al-Rafidain",
  governorate: "baghdad",
  location: "Al-Rusafa",
  waterSource: "tigris",
  designCapacity: "120000",
  actualCapacity: "104500",
  engineer: "",
  notes: "",
};

function errors(over: Record<string, unknown>) {
  const r = validatePlant({ ...valid, ...over });
  return r.ok ? null : r.fieldErrors;
}

describe("plant input schema", () => {
  it("accepts a complete plant and parses numbers", () => {
    const r = validatePlant(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.designCapacity).toBe(120000);
      expect(r.data.actualCapacity).toBe(104500);
      expect(r.data.engineer).toBe("");
    }
  });

  it("requires name, governorate, location, source and design capacity", () => {
    const r = validatePlant({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors).toMatchObject({
        name: "nameRequired",
        governorate: "governorateRequired",
        location: "locationRequired",
        waterSource: "sourceRequired",
        designCapacity: "designRequired",
      });
      expect(r.fieldErrors.actualCapacity).toBeUndefined();
    }
  });

  it("treats blank and whitespace text as missing", () => {
    expect(errors({ name: "   ", location: "" })).toMatchObject({
      name: "nameRequired",
      location: "locationRequired",
    });
  });

  it("rejects governorates and sources outside the lists", () => {
    expect(errors({ governorate: "atlantis" })?.governorate).toBe("governorateRequired");
    expect(errors({ waterSource: "rain" })?.waterSource).toBe("sourceRequired");
  });

  it("design capacity must be a number greater than zero", () => {
    expect(errors({ designCapacity: "" })?.designCapacity).toBe("designRequired");
    expect(errors({ designCapacity: "0" })?.designCapacity).toBe("designInvalid");
    expect(errors({ designCapacity: "-5" })?.designCapacity).toBe("designInvalid");
    expect(errors({ designCapacity: "abc" })?.designCapacity).toBe("designInvalid");
  });

  it("actual capacity is optional, but must be a number of at least zero", () => {
    expect(errors({ actualCapacity: "" })).toBeNull();
    expect(errors({ actualCapacity: "0" })).toBeNull();
    expect(errors({ actualCapacity: "-1" })?.actualCapacity).toBe("actualInvalid");
    expect(errors({ actualCapacity: "x" })?.actualCapacity).toBe("actualInvalid");
    const r = validatePlant({ ...valid, actualCapacity: "" });
    expect(r.ok && r.data.actualCapacity).toBeNull();
  });

  it("rejects actual capacity above 120% of design, accepts exactly 120%", () => {
    expect(errors({ designCapacity: "1000", actualCapacity: "1200" })).toBeNull();
    expect(errors({ designCapacity: "1000", actualCapacity: "1200.5" })?.actualCapacity).toBe(
      "actualTooHigh",
    );
    expect(errors({ designCapacity: "1000", actualCapacity: "1201" })?.actualCapacity).toBe(
      "actualTooHigh",
    );
  });

  it("accepts Arabic-Indic digits and separators", () => {
    const r = validatePlant({ ...valid, designCapacity: "١٢٠٬٠٠٠", actualCapacity: "١٠٤٥٠٠٫٥" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.designCapacity).toBe(120000);
      expect(r.data.actualCapacity).toBe(104500.5);
    }
  });

  it("limits text length", () => {
    expect(errors({ name: "x".repeat(201) })?.name).toBe("tooLong");
    expect(errors({ notes: "x".repeat(2001) })?.notes).toBe("tooLong");
  });
});
