import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { IndicatorDefinition } from '../../features/indicators/entities/indicator-definition.entity';
import { canRoleSeeIndicator } from '../../features/indicators/indicator-visibility.util';

/**
 * Vérifie que le rôle RÉEL de l'utilisateur (table "Users" locale, jamais un rôle envoyé par le
 * client) est autorisé à voir/activer/calculer l'indicateur ciblé par la route - même règle que
 * `RoleService#canSeeIndicatorContext` côté front (voir indicator-visibility.util.ts), mais
 * appliquée ici pour de vrai : sans ce guard, un appel direct à l'API (hors interface Angular)
 * contournait entièrement la restriction de rôle/contexte.
 *
 * Lit l'ID de l'indicateur depuis `:id` ou `:indicatorId` selon le contrôleur. Doit toujours être
 * posé APRÈS AuthGuard : `@UseGuards(AuthGuard, IndicatorVisibilityGuard)`.
 */
@Injectable()
export class IndicatorVisibilityGuard implements CanActivate {
  constructor(
    @InjectRepository(IndicatorDefinition, 'indicators')
    private readonly indicatorModel: Repository<IndicatorDefinition>,
    @Inject('PLATON_DATA_SOURCE')
    private readonly platonDataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }

    const indicatorId = request.params?.id ?? request.params?.indicatorId;
    const indicator = indicatorId
      ? await this.indicatorModel.findOne({ where: { id: indicatorId } })
      : null;
    // Indicateur introuvable : laisse le contrôleur/service renvoyer le 404 approprié plutôt
    // que de le masquer derrière un 403 trompeur.
    if (!indicator) return true;

    const rows: { role: string }[] = await this.platonDataSource.query(
      `SELECT role FROM "Users" WHERE id = $1`,
      [userId],
    );

    if (!canRoleSeeIndicator(rows[0]?.role, indicator.contextType, indicator.visibilityRoles)) {
      throw new ForbiddenException("Vous n'avez pas accès à cet indicateur");
    }

    return true;
  }
}
