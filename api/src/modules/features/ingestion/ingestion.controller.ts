import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { IngestionService } from './ingestion.service';

interface IngestionEventDto {
  type: string;
  userId: string;
  courseId?: string;
  activityId?: string;
  exerciseId?: string;
  timestamp: Date;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

@Controller('ingest')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestEvent(@Body() event: IngestionEventDto) {
    // S'assurer que timestamp est une Date
    if (event.timestamp && typeof event.timestamp === 'string') {
      event.timestamp = new Date(event.timestamp);
    }
    
    this.ingestionService.ingestEvent(event as any).catch(error => {
      console.error('Error processing event:', error);
    });
    
    return { status: 'accepted', message: 'Event received for processing' };
  }

  @Post('batch')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestBatch(@Body() events: IngestionEventDto[]) {
    // Convertir les timestamps
    const processedEvents = events.map(event => ({
      ...event,
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date()
    }));
    
    this.ingestionService.ingestBatch(processedEvents as any).catch(error => {
      console.error('Error processing batch events:', error);
    });
    
    return { status: 'accepted', message: `${events.length} events received` };
  }
}