import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { IndicatorPin, IndicatorPinContextType } from './indicator-pin.entity';

@Injectable()
export class IndicatorPinsService {
  constructor(
    @InjectRepository(IndicatorPin, 'indicators')
    private readonly pinRepository: Repository<IndicatorPin>,
    @Inject('PLATON_DATA_SOURCE')
    private readonly platonDataSource: DataSource,
  ) {}

  async listPins(contextType: IndicatorPinContextType, contextId: string): Promise<IndicatorPin[]> {
    return this.pinRepository.find({ where: { contextType, contextId } });
  }

  /** Nombre de pins par indicateur, tous cours/activités confondus - pour le label affiché
   *  dans l'admin ("N pins"), sans avoir à lister chaque cours/activité concerné. */
  async countPinsByIndicator(): Promise<Record<string, number>> {
    const rows: { indicatorId: string; count: string }[] = await this.pinRepository
      .createQueryBuilder('pin')
      .select('pin.indicatorId', 'indicatorId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('pin.indicatorId')
      .getRawMany();
    return Object.fromEntries(rows.map(r => [r.indicatorId, parseInt(r.count, 10)]));
  }

  async createPin(
    userId: string,
    indicatorId: string,
    contextType: IndicatorPinContextType,
    contextId: string,
    thresholdsOverride?: { good?: number; warning?: number; critical?: number } | null,
  ): Promise<IndicatorPin> {
    await this.assertCanManagePins(userId, contextType, contextId);

    let pin = await this.pinRepository.findOne({ where: { indicatorId, contextType, contextId } });
    if (!pin) {
      pin = this.pinRepository.create({ indicatorId, contextType, contextId, pinnedByUserId: userId });
    }
    pin.thresholdsOverride = thresholdsOverride ?? null;
    return this.pinRepository.save(pin);
  }

  async deletePin(
    userId: string,
    indicatorId: string,
    contextType: IndicatorPinContextType,
    contextId: string,
  ): Promise<void> {
    await this.assertCanManagePins(userId, contextType, contextId);
    await this.pinRepository.delete({ indicatorId, contextType, contextId });
  }

  /** Réplique CoursesService#hasActivityWritePermission : admin global ou membre "teacher"
   *  du cours - n'importe lequel, pas seulement celui qui a créé le pin. */
  private async assertCanManagePins(
    userId: string,
    contextType: IndicatorPinContextType,
    contextId: string,
  ): Promise<void> {
    const userRows: { role: string }[] = await this.platonDataSource.query(
      `SELECT role FROM "Users" WHERE id = $1`,
      [userId],
    );
    if (userRows[0]?.role === 'admin') return;

    let courseId = contextId;
    if (contextType === 'activity') {
      const rows: { course_id: string }[] = await this.platonDataSource.query(
        `SELECT course_id FROM "Activities" WHERE id = $1`,
        [contextId],
      );
      courseId = rows[0]?.course_id;
    }

    const teacherRows: unknown[] = await this.platonDataSource.query(
      `SELECT 1 FROM "CourseMembers" WHERE course_id = $1 AND user_id = $2 AND role = 'teacher'`,
      [courseId, userId],
    );
    if (!teacherRows.length) {
      throw new ForbiddenException("Droit d'écriture requis sur ce cours pour gérer les indicateurs figés");
    }
  }
}
