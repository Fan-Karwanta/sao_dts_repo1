import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { gridPresenceSchema } from "@sao/contracts";
import type { Server, Socket } from "socket.io";
import type { AuthContext } from "./common/auth-context.js";
import { AuthService } from "./auth/auth.service.js";
import { IMPERSONATION_COOKIE, SESSION_COOKIE } from "./auth/auth.constants.js";
import { DatabaseService } from "./database/database.service.js";

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  { auth?: AuthContext }
>;

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly database: DatabaseService,
  ) {}

  private parseCookies(header = "") {
    return Object.fromEntries(
      header
        .split(";")
        .map((part) => part.trim().split("="))
        .filter(([key, value]) => Boolean(key && value))
        .map(([key, value]) => [key!, decodeURIComponent(value!)]),
    );
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const cookies = this.parseCookies(client.handshake.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      if (!token) return client.disconnect(true);
      const auth = await this.authService.resolveSession(
        token,
        cookies[IMPERSONATION_COOKIE],
      );
      client.data.auth = auth;
      await client.join(`user:${auth.user.id}`);
      if (auth.user.permissionKeys.includes("documents.view")) {
        await client.join("documents:view");
      }
      for (const key of auth.user.departmentKeys) {
        await client.join(`department:${key}`);
      }
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage("document.join")
  async joinDocument(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() documentId: string,
  ) {
    const auth = client.data.auth;
    if (!auth?.user.permissionKeys.includes("documents.view")) return { joined: false };
    const document = await this.database.documentRecord.findUnique({
      where: { id: documentId },
      select: { id: true },
    });
    if (!document) return { joined: false };
    await client.join(`document:${document.id}`);
    return { joined: true };
  }

  @SubscribeMessage("grid.presence")
  presence(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: unknown) {
    const auth = client.data.auth;
    const parsed = gridPresenceSchema.safeParse(body);
    if (!auth?.user.permissionKeys.includes("documents.view") || !parsed.success) return;
    this.server
      .to("documents:view")
      .except(client.id)
      .emit("grid.presence", {
        socketId: client.id,
        userId: auth.user.id,
        fullName: auth.user.fullName,
        ...parsed.data,
      });
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (!client.data.auth) return;
    this.server.to("documents:view").emit("grid.presence.left", { socketId: client.id });
  }

  emitToAll(event: string, payload: object) {
    this.server.to("documents:view").emit(event, payload);
  }

  emitToDocument(documentId: string, event: string, payload: object) {
    this.server
      .to([`document:${documentId}`, "documents:view"])
      .emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: object) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
