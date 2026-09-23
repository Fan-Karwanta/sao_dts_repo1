import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import {
  AuthController,
  RegistrationRequestsController,
} from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { CsrfGuard } from "./csrf.guard.js";
import { PermissionsGuard } from "./permissions.guard.js";
import { SessionGuard } from "./session.guard.js";

@Module({
  controllers: [AuthController, RegistrationRequestsController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
