import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { EventRulesService, CreateEventRuleBody } from './event-rules.service';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AuthGuard } from '../../core/auth/auth.guard';

@Controller('event-rules')
@UseGuards(AuthGuard, AdminGuard)
export class EventRulesController {
  constructor(private readonly svc: EventRulesService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() body: CreateEventRuleBody) {
    return this.svc.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<CreateEventRuleBody>) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Get(':id/preview-sql')
  previewInstallSql(@Param('id') id: string) {
    return this.svc.previewInstallSql(id);
  }

  @Post(':id/install')
  installTrigger(@Param('id') id: string) {
    return this.svc.installTrigger(id);
  }

  @Get(':id/preview-uninstall-sql')
  previewUninstallSql(@Param('id') id: string) {
    return this.svc.previewUninstallSql(id);
  }

  @Post(':id/uninstall')
  deleteAndUninstall(@Param('id') id: string) {
    return this.svc.deleteAndUninstall(id);
  }
}
