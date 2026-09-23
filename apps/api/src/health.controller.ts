import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/request.decorators.js";

@Public()
@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return { status: "ok" } as const;
  }

  @Get("ready")
  ready() {
    return { status: "ok" } as const;
  }
}
