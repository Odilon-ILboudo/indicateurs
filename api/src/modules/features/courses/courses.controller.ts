import { Controller, Get, Header, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CoursesService } from './courses.service';

@Controller('v1/courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  search(
    @Query('search') search?: string,
    @Query('members') members?: string | string[],
    @Query('period') period?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('order') order?: string,
    @Query('direction') direction?: string,
    // expands is accepted but ignored (we always expand statistic/permissions)
    @Query('expands') _expands?: string | string[],
    @Query('showAll') _showAll?: string,
    @Query('isTest') _isTest?: string,
  ) {
    return this.coursesService.searchCourses({ search, members, period, offset, limit, order, direction });
  }

  @Get(':id/sections')
  listSections(@Param('id') id: string) {
    return this.coursesService.listSections(id);
  }

  @Get(':id/activities')
  listActivities(
    @Param('id') id: string,
    @Query('sectionId') sectionId?: string,
    @Query('challenge') challenge?: string,
    @Query('expands') _expands?: string | string[],
  ) {
    return this.coursesService.listActivities(id, { sectionId, challenge });
  }

  @Get(':courseId/activities/:activityId/results/date')
  getActivityResultsForDate(
    @Param('activityId') activityId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const now = new Date().toISOString();
    return this.coursesService.getActivityResultsForDate(
      activityId,
      start ?? new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString(),
      end ?? now,
    );
  }

  @Get(':courseId/activities/:activityId/results')
  getActivityResults(@Param('activityId') activityId: string) {
    return this.coursesService.getActivityResults(activityId);
  }

  @Get(':courseId/activities/:activityId/csv')
  async getActivityCsv(
    @Param('activityId') activityId: string,
    @Res() res: Response,
  ) {
    const csv = await this.coursesService.getActivityCsv(activityId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="activity-${activityId}.csv"`);
    res.send('﻿' + csv);
  }

  @Get(':courseId/activities/:activityId')
  findActivity(
    @Param('courseId') courseId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.coursesService.findActivity(courseId, activityId);
  }

  @Get(':id/groups')
  listGroups(@Param('id') id: string) {
    return this.coursesService.listGroups(id);
  }

  @Get(':id/groups/:groupId/members')
  listGroupMembers(
    @Param('id') id: string,
    @Param('groupId') groupId: string,
  ) {
    return this.coursesService.listGroupMembers(id, groupId);
  }

  @Get(':id/members')
  listMembers(
    @Param('id') id: string,
    @Query('roles') roles?: string,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ) {
    return this.coursesService.listMembers(id, { roles, role, search });
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Query('expands') _expands?: string | string[],
  ) {
    return this.coursesService.findCourseById(id);
  }
}
