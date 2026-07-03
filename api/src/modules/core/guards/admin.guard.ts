import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Restreint une route aux utilisateurs dont le rôle global (table "Users" locale) est 'admin'.
 * S'appuie sur `request.user.id`, peuplé par AuthGuard - doit donc toujours être posé APRÈS :
 * `@UseGuards(AuthGuard, AdminGuard)`.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject('PLATON_DATA_SOURCE')
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }

    const rows: { role: string }[] = await this.dataSource.query(
      `SELECT role FROM "Users" WHERE id = $1`,
      [userId],
    );

    if (rows[0]?.role !== 'admin') {
      throw new ForbiddenException('Action réservée aux administrateurs');
    }

    return true;
  }
}
