import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import type { AuthContext } from "../common/auth-context.js";
import { CurrentAuth, RequirePermissions } from "../common/request.decorators.js";
import { parseBody } from "../common/validation.js";
import {
  createWorkflowSchema,
  saveWorkflowDraftSchema,
} from "./workflow.schemas.js";
import { WorkflowService } from "./workflow.service.js";

@Controller("workflows")
export class WorkflowController {
  constructor(private readonly workflows: WorkflowService) {}

  @Get()
  list() {
    return this.workflows.list();
  }

  @Get("published")
  published() {
    return this.workflows.getPublished();
  }

  @Get("versions/:id")
  version(@Param("id") id: string) {
    return this.workflows.getVersion(id);
  }

  @Post()
  @RequirePermissions("workflows.design")
  create(@CurrentAuth() context: AuthContext, @Body() body: unknown) {
    const input = parseBody(createWorkflowSchema, body);
    return this.workflows.create(context, {
      key: input.key,
      name: input.name,
      description: input.description,
    });
  }

  @Post(":id/drafts")
  @RequirePermissions("workflows.design")
  createDraft(@CurrentAuth() context: AuthContext, @Param("id") id: string) {
    return this.workflows.createDraft(context, id);
  }

  @Put("versions/:id")
  @RequirePermissions("workflows.design")
  saveDraft(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.workflows.saveDraft(
      context,
      id,
      parseBody(saveWorkflowDraftSchema, body),
    );
  }

  @Post("versions/:id/publish")
  @RequirePermissions("workflows.publish")
  publish(@CurrentAuth() context: AuthContext, @Param("id") id: string) {
    return this.workflows.publish(context, id);
  }
}
