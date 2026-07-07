import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { EventTypesService } from './event-types.service';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AuthGuard } from '../../core/auth/auth.guard';

@Controller('event-types')
export class EventTypesController {
  constructor(private readonly svc: EventTypesService) {}

  @Get()
  findAll(@Query('configured') configured?: string) {
    return this.svc.findAll(configured === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  create(@Body() body: { name: string; label: string; description?: string }) {
    return this.svc.create(body);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, AdminGuard)
  update(
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; label: string; description: string; isActive: boolean }>,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, AdminGuard)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
