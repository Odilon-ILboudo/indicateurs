// src/modules/features/users/users.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { PlatonService } from '../../core/platon/platon.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('users')
export class UsersController {
  constructor(private readonly platonService: PlatonService) {}

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