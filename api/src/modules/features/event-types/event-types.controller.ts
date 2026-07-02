import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { EventTypesService } from './event-types.service';

@Controller('event-types')
export class EventTypesController {
  constructor(private readonly svc: EventTypesService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() body: { name: string; label: string; description?: string }) {
    return this.svc.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; label: string; description: string; isActive: boolean }>,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
