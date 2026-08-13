import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { EventRulesService } from './event-rules.service';
import { CreateEventRuleDto, UpdateEventRuleDto } from './dto/event-rule.dto';
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
  create(@Body() body: CreateEventRuleDto) {
    return this.svc.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateEventRuleDto) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.svc.reactivate(id);
  }

  @Get(':id/preview-hard-delete-sql')
  previewHardDeleteSql(@Param('id') id: string) {
    return this.svc.previewHardDeleteSql(id);
  }

  @Post(':id/hard-delete')
  hardDelete(@Param('id') id: string) {
    return this.svc.hardDelete(id);
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
