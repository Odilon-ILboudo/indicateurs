import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * Retourne les groupes de TP d'un enseignant.
   * GET /api/groups?teacherId=uuid
   */
  @Get()
  getGroupsForTeacher(@Query('teacherId') teacherId: string) {
    if (!teacherId) throw new BadRequestException('teacherId requis');
    return this.groupsService.getGroupsForTeacher(teacherId);
  }

  /**
   * Retourne les membres d'un groupe.
   * GET /api/groups/:groupId/members  → utiliser query param pour simplicité
   * GET /api/groups/members?groupId=uuid
   */
  @Get('members')
  getGroupMembers(@Query('groupId') groupId: string) {
    if (!groupId) throw new BadRequestException('groupId requis');
    return this.groupsService.getUserIdsByGroup(groupId);
  }
}
