import { Module } from "@nestjs/common";
import { AdministrationModule } from "./administration/administration.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DocumentModule } from "./documents/document.module.js";
import { HealthController } from "./health.controller.js";
import { NotificationModule } from "./notifications/notification.module.js";
import { RealtimeModule } from "./realtime.module.js";
import { WorkflowModule } from "./workflows/workflow.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    AuthModule,
    RealtimeModule,
    AdministrationModule,
    WorkflowModule,
    DocumentModule,
    NotificationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
