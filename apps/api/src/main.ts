import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });

import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  app.enableCors({ origin: webOrigin, credentials: true });
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  await app.listen(port);
}

void bootstrap();
