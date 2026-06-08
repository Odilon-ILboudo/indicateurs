// src/modules/features/indicators/indicators.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, BadRequestException,
} from '@nestjs/common';
import { IndicatorsService } from './indicators.service';
import { FormulaInterpreterService } from './interpreter/formula-interpreter.service';

@Controller('indicators')
export class IndicatorsController {
  constructor(
    private readonly indicatorsService: IndicatorsService,
    private readonly formulaInterpreter: FormulaInterpreterService,
  ) {}

  // ── Lecture ──────────────────────────────────────────────────────────────

  @Get()
  async getAllIndicators() {
    return this.indicatorsService.findAllActive();
  }

  // IMPORTANT : routes littérales avant /:id pour éviter les conflits
  @Get('all')
  async getAllForAdmin() {
    return this.indicatorsService.findAllForAdmin();
  }

  /** Retourne les tables PLaTon disponibles et leurs colonnes pour le builder. */
  @Get('schema')
  async getPlatonSchema() {
    return this.indicatorsService.getPlatonSchema();
  }

  /** Retourne les cours + groupes d'un enseignant pour le sélecteur de contexte. */
  @Get('teacher/:teacherId/context')
  async getTeacherContext(@Param('teacherId') teacherId: string) {
    return this.indicatorsService.getTeacherContext(teacherId);
  }

  /** Retourne les activités actives d'un cours. */
  @Get('course/:courseId/activities')
  async getCourseActivities(@Param('courseId') courseId: string) {
    return this.indicatorsService.getCourseActivities(courseId);
  }

  /** Retourne les étudiants d'un cours (pour le sélecteur de test de formule). */
  @Get('course/:courseId/students')
  async getCourseStudents(@Param('courseId') courseId: string) {
    return this.indicatorsService.getCourseStudents(courseId);
  }

  /**
   * Retourne la configuration de l'indicateur (contextType + visualizations + formula).
   * GET /api/indicators/:id/context-configs
   */
  @Get(':id/context-configs')
  async getContextConfigs(@Param('id') id: string) {
    const indicator = await this.indicatorsService.findById(id);
    return {
      contextType: indicator.contextType,
      visualizations: indicator.visualizations,
      formula: indicator.formula,
    };
  }

  @Get(':id')
  async getIndicator(@Param('id') id: string) {
    return this.indicatorsService.findById(id);
  }

  @Get(':id/values')
  async getIndicatorValues(
    @Param('id') id: string,
    @Query('contextType') contextType: string,
    @Query('contextId') contextId: string,
    @Query('period') period: 'hour' | 'day' | 'week' | 'month' = 'day',
    @Query('limit') limit = 30,
  ) {
    if (!contextType || !contextId) {
      throw new BadRequestException('contextType and contextId are required');
    }
    return this.indicatorsService.getValues(id, contextType, contextId, period, limit);
  }

  @Get(':id/usage')
  async getIndicatorUsage(@Param('id') id: string) {
    const indicator = await this.indicatorsService.findById(id);
    return { usageCount: indicator.usageCount };
  }

  @Get(':id/formula-history')
  async getFormulaHistory(@Param('id') id: string) {
    return this.indicatorsService.getFormulaHistory(id);
  }

  @Get(':id/logs')
  async getExecutionLogs(
    @Param('id') id: string,
    @Query('limit') limit = 50,
  ) {
    return this.indicatorsService.getExecutionLogs(id, +limit);
  }

  // ── Écriture ─────────────────────────────────────────────────────────────

  @Post()
  async createIndicator(@Body() definition: any) {
    return this.indicatorsService.create(definition);
  }

  @Post('dashboard')
  async getDashboardIndicators(
    @Body() request: {
      indicators: string[];
      context: { contextType: string; contextId: string; userId: string };
    },
  ) {
    return this.indicatorsService.getDashboardValues(request);
  }

  /**
   * Calcule la formule d'un indicateur pour un contexte donné et persiste le résultat.
   * POST /api/indicators/:id/compute-view
   * Body: { contextType, contextId, activityId? }
   */
  @Post(':id/compute-view')
  async computeView(
    @Param('id') id: string,
    @Body() body: { contextType: string; contextId: string; activityId?: string; vizId?: string },
  ) {
    if (!body.contextType || !body.contextId) {
      throw new BadRequestException('contextType et contextId sont requis');
    }
    return this.indicatorsService.computeView(
      id, body.contextType, body.contextId, body.activityId, body.vizId,
    );
  }

  /**
   * Prévisualise le résultat brut d'un pipeline DSL sans persister.
   * Supporte les contextes learner et group.
   * POST /api/indicators/preview
   * Body: { formula, context: { userId?, groupId?, activityId? } }
   */
  @Post('preview')
  async previewFormula(
    @Body() body: {
      formula: any;
      context: { userId?: string; groupId?: string; activityId?: string };
    },
  ) {
    return this.indicatorsService.preview(body.formula, body.context);
  }

  /**
   * Pré-calcule toutes les vues de tous les indicateurs actifs pour un contexte donné.
   * Appelé dès qu'un enseignant sélectionne un cours + une activité.
   * POST /api/indicators/precompute-context
   * Body: { contextType: 'course'|'group', contextId: string, activityId: string }
   */
  @Post('precompute-context')
  async precomputeContext(
    @Body() body: { contextType: string; contextId: string; activityId: string },
  ) {
    if (!body.contextType || !body.contextId || !body.activityId) {
      throw new BadRequestException('contextType, contextId et activityId sont requis');
    }
    return this.indicatorsService.precomputeForContext(body.contextType, body.contextId, body.activityId);
  }

  @Post(':id/recalculate')
  async recalculate(@Param('id') id: string) {
    return this.indicatorsService.recalculate(id);
  }

  @Post(':id/rollback/:versionId')
  async rollbackFormula(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.indicatorsService.rollbackFormula(id, versionId);
  }

  @Patch(':id')
  async updateIndicator(@Param('id') id: string, @Body() data: any) {
    return this.indicatorsService.update(id, data);
  }

  @Patch(':id/status')
  async toggleStatus(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.indicatorsService.toggleStatus(id, body.isActive);
  }

  @Delete(':id')
  async deleteIndicator(@Param('id') id: string) {
    await this.indicatorsService.delete(id);
    return { success: true };
  }

  // ── Snapshots (comparaison groupes côte à côte) ──────────────────────────

  /** Liste les snapshots d'un indicateur pour une activité donnée. */
  @Get(':id/snapshots')
  async getSnapshots(
    @Param('id') id: string,
    @Query('activityId') activityId: string,
  ) {
    if (!activityId) throw new BadRequestException('activityId est requis');
    return this.indicatorsService.getSnapshots(id, activityId);
  }

  /** Crée un snapshot (groupe + activité). Retourne 409 si déjà existant. */
  @Post(':id/snapshots')
  async createSnapshot(
    @Param('id') id: string,
    @Body() body: { contextType: string; contextId: string; activityId: string; title: string },
  ) {
    if (!body.contextId || !body.activityId || !body.title) {
      throw new BadRequestException('contextId, activityId et title sont requis');
    }
    return this.indicatorsService.createSnapshot(id, { ...body, contextType: body.contextType ?? 'group' });
  }

  /** Met à jour le titre d'un snapshot. */
  @Patch(':id/snapshots/:snapshotId')
  async updateSnapshotTitle(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
    @Body() body: { title: string },
  ) {
    if (!body.title?.trim()) throw new BadRequestException('title est requis');
    return this.indicatorsService.updateSnapshotTitle(id, snapshotId, body.title.trim());
  }

  /** Supprime un snapshot. */
  @Delete(':id/snapshots/:snapshotId')
  async deleteSnapshot(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    await this.indicatorsService.deleteSnapshot(id, snapshotId);
    return { success: true };
  }
}
