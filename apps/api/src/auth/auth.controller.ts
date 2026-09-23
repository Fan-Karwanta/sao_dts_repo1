import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import type { AuthContext } from "../common/auth-context.js";
import {
  CurrentAuth,
  Public,
  RequirePermissions,
} from "../common/request.decorators.js";
import { parseBody } from "../common/validation.js";
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_DURATION_MS,
  SESSION_COOKIE,
  SESSION_DURATION_MS,
} from "./auth.constants.js";
import {
  adminResetPasswordSchema,
  changePasswordSchema,
  impersonateSchema,
  loginSchema,
  registerSchema,
  reviewRegistrationSchema,
} from "./auth.schemas.js";
import { AuthService } from "./auth.service.js";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get("registration-roles")
  registrationRoles() {
    return this.authService.listRegistrationRoles();
  }

  @Public()
  @Post("register")
  register(@Body() body: unknown) {
    return this.authService.register(parseBody(registerSchema, body));
  }

  @Public()
  @Post("login")
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(parseBody(loginSchema, body));
    response.cookie(SESSION_COOKIE, result.token, {
      ...cookieOptions,
      maxAge: SESSION_DURATION_MS,
    });
    return { user: result.user, expiresAt: result.expiresAt };
  }

  @Post("logout")
  async logout(
    @CurrentAuth() context: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(context);
    response.clearCookie(SESSION_COOKIE, cookieOptions);
    response.clearCookie(IMPERSONATION_COOKIE, cookieOptions);
    return { success: true };
  }

  @Get("me")
  me(@CurrentAuth() context: AuthContext) {
    return context;
  }

  @Patch("password")
  changePassword(@CurrentAuth() context: AuthContext, @Body() body: unknown) {
    return this.authService.changePassword(
      context,
      parseBody(changePasswordSchema, body),
    );
  }

  @RequirePermissions("users.impersonate")
  @Post("impersonation")
  async impersonate(
    @CurrentAuth() context: AuthContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parseBody(impersonateSchema, body);
    const result = await this.authService.startImpersonation(
      context,
      input.userId,
      input.reason,
    );
    response.cookie(IMPERSONATION_COOKIE, result.id, {
      ...cookieOptions,
      maxAge: IMPERSONATION_DURATION_MS,
    });
    return result;
  }

  @Delete("impersonation")
  async stopImpersonation(
    @CurrentAuth() context: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.stopImpersonation(context);
    response.clearCookie(IMPERSONATION_COOKIE, cookieOptions);
    return result;
  }

  @RequirePermissions("users.password.reset")
  @Post("admin-reset-password")
  adminResetPassword(@CurrentAuth() context: AuthContext, @Body() body: unknown) {
    const input = parseBody(adminResetPasswordSchema, body);
    return this.authService.adminResetPassword(context, input.userId);
  }
}

@Controller("registration-requests")
@RequirePermissions("registrations.manage")
export class RegistrationRequestsController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  list() {
    return this.authService.listRegistrationRequests();
  }

  @Post(":id/approve")
  approve(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(reviewRegistrationSchema, body);
    return this.authService.approveRegistration(context, id, input.reason);
  }

  @Post(":id/reject")
  reject(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(reviewRegistrationSchema, body);
    return this.authService.rejectRegistration(context, id, input.reason);
  }
}
