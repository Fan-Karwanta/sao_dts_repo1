import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthContext } from "../common/auth-context.js";
import { CurrentAuth, RequirePermissions } from "../common/request.decorators.js";
import { parseBody } from "../common/validation.js";
import {
  createDocumentSchema,
  moveDocumentSchema,
  resolveConcernSchema,
  returnDocumentSchema,
  updateFieldSchema,
} from "./document.schemas.js";
import { DocumentService } from "./document.service.js";

@Controller("documents")
@RequirePermissions("documents.view")
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}

  @Get()
  list() {
    return this.documents.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.documents.get(id);
  }

  @Post()
  @RequirePermissions("documents.create")
  create(@CurrentAuth() context: AuthContext, @Body() body: unknown) {
    const input = parseBody(createDocumentSchema, body);
    return this.documents.create(context, input.referenceNumber, input.title);
  }

  @Patch(":id/fields/:nodeId")
  @RequirePermissions("documents.fields.edit")
  updateField(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(updateFieldSchema, body);
    return this.documents.updateField(
      context,
      id,
      nodeId,
      input.value,
      input.expectedVersion,
    );
  }

  @Post(":id/move")
  @RequirePermissions("documents.advance")
  move(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(moveDocumentSchema, body);
    return this.documents.move(context, id, input.targetNodeId, input.reason, false);
  }

  @Post(":id/return")
  @RequirePermissions("documents.return")
  returnDocument(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(returnDocumentSchema, body);
    return this.documents.move(context, id, input.targetNodeId, input.reason, true);
  }

  @Post("concerns/:id/resolve")
  @RequirePermissions("documents.fields.edit")
  resolveConcern(
    @CurrentAuth() context: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(resolveConcernSchema, body);
    return this.documents.resolveConcern(context, id, input.resolution);
  }
}
