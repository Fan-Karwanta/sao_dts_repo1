import { UnauthorizedException } from "@nestjs/common";
import { verify } from "argon2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service.js";
import type { DatabaseService } from "../database/database.service.js";
import { AuthService } from "./auth.service.js";

vi.mock("argon2", () => ({
  argon2id: 2,
  hash: vi.fn(),
  verify: vi.fn(),
}));

const database = {
  user: { findFirst: vi.fn() },
  registrationRequest: { findFirst: vi.fn() },
  credential: { update: vi.fn() },
  $transaction: vi.fn(),
};

const audit = { record: vi.fn() };

const service = new AuthService(
  database as unknown as DatabaseService,
  audit as unknown as AuditService,
);

const loginInput = { identifier: "juan@example.com", password: "Password123" };

const userWithStatus = (status: string) => ({
  id: "user-1",
  publicId: "public-1",
  fullName: "Juan Dela Cruz",
  username: "juan",
  email: "juan@example.com",
  status,
  credential: {
    passwordHash: "stored-hash",
    failedLoginCount: 0,
    lockedUntil: null,
    mustChangePassword: false,
  },
  userRoles: [],
});

async function loginFailure() {
  const failure = await service.login(loginInput).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(UnauthorizedException);
  return failure as UnauthorizedException;
}

describe("AuthService.login account status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a pending registration request once the password checks out", async () => {
    database.user.findFirst.mockResolvedValue(null);
    database.registrationRequest.findFirst.mockResolvedValue({
      passwordHash: "stored-hash",
      status: "PENDING",
    });
    vi.mocked(verify).mockResolvedValue(true);

    const failure = await loginFailure();
    expect(failure.getResponse()).toMatchObject({ code: "ACCOUNT_PENDING" });
  });

  it("reports a rejected registration request", async () => {
    database.user.findFirst.mockResolvedValue(null);
    database.registrationRequest.findFirst.mockResolvedValue({
      passwordHash: "stored-hash",
      status: "REJECTED",
    });
    vi.mocked(verify).mockResolvedValue(true);

    const failure = await loginFailure();
    expect(failure.getResponse()).toMatchObject({ code: "ACCOUNT_REJECTED" });
  });

  it("hides registration status when the password is wrong", async () => {
    database.user.findFirst.mockResolvedValue(null);
    database.registrationRequest.findFirst.mockResolvedValue({
      passwordHash: "stored-hash",
      status: "PENDING",
    });
    vi.mocked(verify).mockResolvedValue(false);

    const failure = await loginFailure();
    expect(failure.getResponse()).toMatchObject({
      message: "Invalid credentials",
    });
  });

  it("keeps unknown identifiers as invalid credentials", async () => {
    database.user.findFirst.mockResolvedValue(null);
    database.registrationRequest.findFirst.mockResolvedValue(null);

    const failure = await loginFailure();
    expect(failure.getResponse()).toMatchObject({
      message: "Invalid credentials",
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it("reports a blocked user account after password verification", async () => {
    database.user.findFirst.mockResolvedValue(userWithStatus("BLOCKED"));
    vi.mocked(verify).mockResolvedValue(true);

    const failure = await loginFailure();
    expect(failure.getResponse()).toMatchObject({ code: "ACCOUNT_BLOCKED" });
  });

  it("reports a pending user account after password verification", async () => {
    database.user.findFirst.mockResolvedValue(userWithStatus("PENDING"));
    vi.mocked(verify).mockResolvedValue(true);

    const failure = await loginFailure();
    expect(failure.getResponse()).toMatchObject({ code: "ACCOUNT_PENDING" });
  });

  it("does not disclose account status when the password is wrong", async () => {
    database.user.findFirst.mockResolvedValue(userWithStatus("BLOCKED"));
    vi.mocked(verify).mockResolvedValue(false);

    const failure = await loginFailure();
    expect(failure.getResponse()).toMatchObject({
      message: "Invalid credentials",
    });
    expect(database.credential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { failedLoginCount: 1, lockedUntil: null },
      }),
    );
  });

  it("creates a session for an active user", async () => {
    const session = { id: "session-1", expiresAt: new Date() };
    database.user.findFirst.mockResolvedValue(userWithStatus("ACTIVE"));
    vi.mocked(verify).mockResolvedValue(true);
    database.$transaction.mockImplementation(
      (callback: (transaction: unknown) => unknown) =>
        callback({
          credential: { update: vi.fn() },
          session: { create: vi.fn().mockResolvedValue(session) },
        }),
    );

    const result = await service.login(loginInput);
    expect(result.user.username).toBe("juan");
    expect(result.token).toBeTruthy();
    expect(result.expiresAt).toBe(session.expiresAt);
  });
});
