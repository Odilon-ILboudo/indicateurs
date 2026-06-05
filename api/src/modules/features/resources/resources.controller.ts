import { Controller, Get, Param, Query } from '@nestjs/common';
import { ResourcesService } from './resources.service';

@Controller('v1/resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  // --- Static routes MUST come before /:id ---

  @Get('tree')
  getTree() {
    return this.resourcesService.getCircleTree();
  }

  @Get('completion')
  getCompletion() {
    return this.resourcesService.getCompletion();
  }

  @Get('owners')
  getOwners() {
    return this.resourcesService.getOwners();
  }

  @Get('user-circle')
  getUserCircle(@Query('userId') userId: string) {
    return this.resourcesService.getUserCircle(userId ?? '');
  }

  // --- Parameterized routes ---

  @Get()
  search(
    @Query('search') search?: string,
    @Query('types') types?: string | string[],
    @Query('status') status?: string | string[],
    @Query('owners') owners?: string | string[],
    @Query('parents') parents?: string | string[],
    @Query('personal') personal?: string,
    @Query('views') views?: string,
    @Query('period') period?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('order') order?: string,
    @Query('direction') direction?: string,
    // accepted but ignored
    @Query('expands') _expands?: string | string[],
    @Query('topics') _topics?: string | string[],
    @Query('antiTopics') _antiTopics?: string | string[],
    @Query('levels') _levels?: string | string[],
    @Query('dependOn') _dependOn?: string | string[],
    @Query('configurable') _configurable?: string,
    @Query('certifiedTemplate') _certifiedTemplate?: string,
    @Query('navigation') _navigation?: string,
    @Query('usedBy') _usedBy?: string | string[],
    @Query('publicPreview') _publicPreview?: string,
    @Query('watchers') _watchers?: string | string[],
    @Query('members') _members?: string | string[],
    @Query('useTemplate') _useTemplate?: string,
    @Query('markAsViewed') _markAsViewed?: string,
  ) {
    return this.resourcesService.searchResources({
      search, types, status, owners, parents, personal, views, period, offset, limit, order, direction,
    });
  }

  @Get(':id')
  findById(
    @Param('id') id: string,
    @Query('expands') _expands?: string | string[],
    @Query('markAsViewed') _markAsViewed?: string,
  ) {
    return this.resourcesService.findResourceById(id);
  }
}
