import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';

export interface IndicatorUpdatePayload {
  indicatorId: string;
  indicatorName: string;
  contextType: string;
  contextId: string;
  value: number;
  eventType: string;
  timestamp: Date;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/indicators',
})
@Injectable()
export class IndicatorsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(IndicatorsGateway.name);
  private connectedClients = 0;

  onModuleInit() {
    this.logger.log('IndicatorsGateway initialisé');
  }

  handleConnection(client: Socket) {
    this.connectedClients++;
    this.logger.log(`Client connecté: ${client.id} (total: ${this.connectedClients})`);
  }

  handleDisconnect(client: Socket) {
    this.connectedClients--;
    this.logger.log(`Client déconnecté: ${client.id} (total: ${this.connectedClients})`);
  }

  // Écoute tous les événements indicator.*.updated émis par IngestionService
  @OnEvent('indicator.updated')
  handleIndicatorUpdated(payload: IndicatorUpdatePayload) {
    if (this.connectedClients === 0) return;

    this.server.emit('indicator.updated', payload);
    this.logger.debug(
      `WS broadcast: "${payload.indicatorName}" (${payload.contextType}) ` +
      `contextId=${payload.contextId} value=${payload.value}`,
    );
  }
}
