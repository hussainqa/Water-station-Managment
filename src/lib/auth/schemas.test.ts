import { describe, expect, it } from "vitest";
import {
  fieldErrorsFromZod,
  forgotPasswordSchema,
  profileSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas";

const validSignUp = {
  name: "Sara Jubouri",
  jobTitle: "Engineer",
  email: "sara@example.iq",
  password: "longenough",
  confirmPassword: "longenough",
};

describe("signUpSchema", () => {
  it("accepts valid input and trims", () => {
    const r = signUpSchema.safeParse({ ...validSignUp, name: "  Sara  " });
    expect(r.success && r.data.name).toBe("Sara");
  });
  it("reports every missing field with a code", () => {
    const r = signUpSchema.safeParse({
      name: " ",
      jobTitle: "",
      email: "",
      password: "",
      confirmPassword: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(fieldErrorsFromZod(r.error)).toMatchObject({
        name: "nameRequired",
        jobTitle: "jobTitleRequired",
        email: "emailRequired",
        password: "passwordShort",
      });
    }
  });
  it("rejects bad email, short password and mismatch", () => {
    const bad = signUpSchema.safeParse({
      ...validSignUp,
      email: "nope",
      password: "short",
      confirmPassword: "other",
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const e = fieldErrorsFromZod(bad.error);
      expect(e.email).toBe("emailInvalid");
      expect(e.password).toBe("passwordShort");
    }
    const mismatch = signUpSchema.safeParse({
      ...validSignUp,
      confirmPassword: "different1",
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(fieldErrorsFromZod(mismatch.error).confirmPassword).toBe(
        "passwordMismatch",
      );
    }
  });
  it("accepts exactly 8 characters", () => {
    expect(
      signUpSchema.safeParse({
        ...validSignUp,
        password: "12345678",
        confirmPassword: "12345678",
      }).success,
    ).toBe(true);
  });
});

describe("signInSchema", () => {
  it("requires email and password", () => {
    const r = signInSchema.safeParse({ email: "", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(fieldErrorsFromZod(r.error)).toEqual({
        email: "emailRequired",
        password: "passwordRequired",
      });
    }
  });
});

describe("forgotPasswordSchema", () => {
  it("validates the email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "a@b" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("needs a token, 8+ chars and a matching confirmation", () => {
    expect(
      resetPasswordSchema.safeParse({
        token: "t",
        password: "12345678",
        confirmPassword: "12345678",
      }).success,
    ).toBe(true);
    expect(
      resetPasswordSchema.safeParse({
        token: "",
        password: "12345678",
        confirmPassword: "12345678",
      }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        token: "t",
        password: "12345678",
        confirmPassword: "1234567",
      }).success,
    ).toBe(false);
  });
});

describe("profileSchema", () => {
  it("requires name and job title", () => {
    expect(profileSchema.safeParse({ name: "A", jobTitle: "B" }).success).toBe(true);
    expect(profileSchema.safeParse({ name: "A", jobTitle: " " }).success).toBe(false);
  });
});
