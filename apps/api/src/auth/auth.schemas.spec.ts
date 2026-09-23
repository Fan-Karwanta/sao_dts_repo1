import { describe, expect, it } from "vitest";
import { registerSchema } from "./auth.schemas.js";

const validRegistration = {
  fullName: "Procurement User",
  username: "procurement.user",
  email: "procurement@example.com",
  officeDesignation: "Procurement Office",
  requestedRoleKey: "procurement_staff",
  password: "StrongPassword123",
  confirmPassword: "StrongPassword123",
  termsAccepted: true,
  termsVersion: "1.0",
};

describe("registerSchema", () => {
  it("accepts a complete registration request", () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      confirmPassword: "DifferentPassword123",
    });
    expect(result.success).toBe(false);
  });

  it("requires terms acceptance", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      termsAccepted: false,
    });
    expect(result.success).toBe(false);
  });
});
