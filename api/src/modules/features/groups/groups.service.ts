import { Injectable } from '@nestjs/common';
import { PlatonService } from '../../core/platon/platon.service';

@Injectable()
export class GroupsService {
  constructor(private readonly platonService: PlatonService) {}

  getGroupsForTeacher(teacherId: string) {
    return this.platonService.getGroupsForTeacher(teacherId);
  }

  getUserIdsByGroup(groupId: string) {
    return this.platonService.getUserIdsByGroup(groupId);
  }
}
