// src/modules/features/users/users.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { PlatonService } from '../../core/platon/platon.service';

@Controller('users')
export class UsersController {
  constructor(private readonly platonService: PlatonService) {}

  @Get(':id')
  async getUserById(@Param('id') id: string) {
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