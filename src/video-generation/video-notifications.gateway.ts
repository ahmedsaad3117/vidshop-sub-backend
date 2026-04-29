import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { VideoGeneration } from '../entities';

interface VideoNotificationPayload {
  videoId: string;
  userId: string;
  status: 'completed' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
  tokensUsed?: number;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/video-notifications',
})
export class VideoNotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(VideoNotificationsGateway.name);
  private userSocketMap = new Map<string, Set<string>>(); // userId -> Set of socketIds

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Remove socket from user mapping
    for (const [userId, socketIds] of this.userSocketMap.entries()) {
      socketIds.delete(client.id);
      if (socketIds.size === 0) {
        this.userSocketMap.delete(userId);
      }
    }
  }

  /**
   * Client subscribes to notifications for their user
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { userId } = data;
    
    if (!userId) {
      this.logger.warn(`Client ${client.id} tried to subscribe without userId`);
      return { error: 'userId is required' };
    }

    if (!this.userSocketMap.has(userId)) {
      this.userSocketMap.set(userId, new Set());
    }
    
    this.userSocketMap.get(userId)!.add(client.id);
    
    this.logger.log(`Client ${client.id} subscribed to notifications for user ${userId}`);
    
    return { success: true, message: `Subscribed to notifications for user ${userId}` };
  }

  /**
   * Client unsubscribes from notifications
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { userId } = data;
    
    if (this.userSocketMap.has(userId)) {
      this.userSocketMap.get(userId)!.delete(client.id);
      if (this.userSocketMap.get(userId)!.size === 0) {
        this.userSocketMap.delete(userId);
      }
    }
    
    this.logger.log(`Client ${client.id} unsubscribed from user ${userId}`);
    
    return { success: true, message: 'Unsubscribed successfully' };
  }

  /**
   * Notify user about video completion
   */
  notifyVideoCompleted(video: VideoGeneration) {
    const payload: VideoNotificationPayload = {
      videoId: video.id,
      userId: video.userId,
      status: 'completed',
      videoUrl: video.videoUrl || undefined,
      tokensUsed: video.tokensUsed || undefined,
    };

    this.sendToUser(video.userId, 'video:completed', payload);
    
    this.logger.log(`Sent completion notification for video ${video.id} to user ${video.userId}`);
  }

  /**
   * Notify user about video failure
   */
  notifyVideoFailed(video: VideoGeneration) {
    const payload: VideoNotificationPayload = {
      videoId: video.id,
      userId: video.userId,
      status: 'failed',
      errorMessage: video.errorMessage || undefined,
    };

    this.sendToUser(video.userId, 'video:failed', payload);
    
    this.logger.log(`Sent failure notification for video ${video.id} to user ${video.userId}`);
  }

  /**
   * Send message to all sockets connected for a specific user
   */
  private sendToUser(userId: string, event: string, data: any) {
    const socketIds = this.userSocketMap.get(userId);
    
    if (!socketIds || socketIds.size === 0) {
      this.logger.debug(`No active sockets for user ${userId}`);
      return;
    }

    for (const socketId of socketIds) {
      this.server.to(socketId).emit(event, data);
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }
}
