import { Controller, Get, Param, Query } from '@nestjs/common';
import { PlatonService } from '../../core/platon/platon.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('users')
export class UsersController {
  constructor(private readonly platonService: PlatonService) {}

  /** Enveloppe { success, data: { resources, total } } attendue par UserService.search(). */
  @Get()
  async searchUsers(
    @Query('search') search?: string,
    @Query('roles') roles?: string | string[],
    @Query('limit') limit?: string,
  ) {
    const roleList = roles == null ? undefined : Array.isArray(roles) ? roles : [roles];
    const resources = await this.platonService.searchUsers(
      search ?? '',
      roleList,
      limit ? parseInt(limit, 10) : 10,
    );
    return { success: true, data: { resources, total: resources.length } };
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    if (!UUID_RE.test(id)) {
      return { success: false, message: `ID invalide : "${id}" n'est pas un UUID` };
    }
    const user = await this.platonService.getUserById(id);
    if (!user) {
      return { success: false, message: 'Utilisateur non trouvé' };
    }
    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        email: user.email,
      },
    };
  }
}