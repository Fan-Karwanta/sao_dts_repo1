import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthContext } from "../common/auth-context.js";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class NotificationService {
  constructor(private readonly database: DatabaseService) {}

  list(userId: string) {
    return this.database.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async markRead(context: AuthContext, id: string) {
    const result = await this.database.notification.updateMany({
      where: { id, userId: context.user.id },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException("Notification not found");
    return { success: true };
  }
}
