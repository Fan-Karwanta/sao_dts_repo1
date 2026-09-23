import { Module } from "@nestjs/common";
import { DocumentController } from "./document.controller.js";
import { DocumentService } from "./document.service.js";

@Module({
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
