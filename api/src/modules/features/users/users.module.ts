// src/modules/features/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { PlatonModule } from '../../core/platon/platon.module';

@Module({
  imports: [PlatonModule],
  controllers: [UsersController],
})
export class UsersModule {}