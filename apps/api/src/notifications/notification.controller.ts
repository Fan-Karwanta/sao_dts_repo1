import { Controller, Get, Param, Patch } from "@nestjs/common";
import type { AuthContext } from "../common/auth-context.js";
import { CurrentAuth } from "../common/request.decorators.js";
import { NotificationService } from "./notification.service.js";

@Controller("notifications")
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentAuth() context: AuthContext) {
    return this.notifications.list(context.user.id);
  }

  @Patch(":id/read")
  markRead(@CurrentAuth() context: AuthContext, @Param("id") id: string) {
    return this.notifications.markRead(context, id);
  }
}
