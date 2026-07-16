// src/modules/features/indicators/indicators.controller.ts
import {
  Controller, Get, Post, Patch, Delete, UseGuards,
  Body, Param, Query, Req, BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { IndicatorsService } from './indicators.service';
import { FormulaInterpreterService } from './interpreter/formula-interpreter.service';
import { IndicatorPinsService } from '../indicator-pins/indicator-pins.service';
import { IndicatorPinContextType } from '../indicator-pins/indicator-pin.entity';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AuthGuard, AuthenticatedUser } from '../../core/auth/auth.guard';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Controller('indicators')
export class IndicatorsController {
  constructor(
    private readonly indicatorsService: IndicatorsService,
    private readonly formulaInterpreter: FormulaInterpreterService,
    private readonly pinsService: IndicatorPinsService,
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

  /** Recherche d'indicateurs similaires par nom/description (pour la détection de doublons). */
  @Get('search')
  async searchSimilar(
    @Query('q') q: string,
    @Query('excludeId') excludeId?: string,
  ) {
    if (!q?.trim()) return [];
    return this.indicatorsService.searchSimilar(q, excludeId);
  }

  /** Retourne les tables PLaTon disponibles et leurs colonnes pour le builder. */
  @Get('schema')
  async getPlatonSchema() {
    return this.indicatorsService.getPlatonSchema();
  }

  @Get('schema/full')
  async getFullSchema() {
    return this.indicatorsService.getFullSchema();
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

  /** Liste les indicateurs figés (pins enseignant) sur un cours/une activité précis. */
  @Get('pins')
  @UseGuards(AuthGuard)
  async listPins(
    @Query('contextType') contextType: IndicatorPinContextType,
    @Query('contextId') contextId: string,
  ) {
    if (!contextType || !contextId) {
      throw new BadRequestException('contextType et contextId sont requis');
    }
    return this.pinsService.listPins(contextType, contextId);
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

  @Get(':id/logs')
  async getExecutionLogs(
    @Param('id') id: string,
    @Query('limit') limit = 50,
  ) {
    return this.indicatorsService.getExecutionLogs(id, +limit);
  }

  // ── Écriture ─────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
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
   * Body: { formula, context: { userId?, groupId?, activityId?, courseId? } }
   */
  @Post('preview')
  async previewFormula(
    @Body() body: {
      formula: any;
      context: { userId?: string; groupId?: string; activityId?: string; courseId?: string };
    },
  ) {
    return this.indicatorsService.preview(body.formula, body.context);
  }

  @Post('preview-steps')
  async previewFormulaSteps(
    @Body() body: {
      formula: any;
      context: { userId?: string; groupId?: string; activityId?: string; courseId?: string };
    },
  ) {
    return this.indicatorsService.previewSteps(body.formula, body.context);
  }

  @Post(':id/recalculate')
  @UseGuards(AuthGuard, AdminGuard)
  async recalculate(@Param('id') id: string) {
    return this.indicatorsService.recalculate(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, AdminGuard)
  async updateIndicator(@Param('id') id: string, @Body() data: any) {
    return this.indicatorsService.update(id, data);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard, AdminGuard)
  async toggleStatus(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.indicatorsService.toggleStatus(id, body.isActive);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, AdminGuard)
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

  // ── Notifications ─────────────────────────────────────────────────────────

  /** Envoie une notification liée à un indicateur. */
  @Post(':id/notify')
  @UseGuards(AuthGuard, AdminGuard)
  async sendNotification(
    @Param('id') id: string,
    @Body() body: { title: string; message: string },
  ) {
    return this.indicatorsService.sendNotification(id, body.title, body.message);
  }

  // ── Pins (figer un indicateur sur un cours/activité) ────────────────────────
  // Pas d'AdminGuard : le contrôle fin (admin OU enseignant avec droit d'écriture
  // sur le cours) est fait dans IndicatorPinsService#assertCanManagePins.

  @Post(':id/pins')
  @UseGuards(AuthGuard)
  async createPin(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { contextType: IndicatorPinContextType; contextId: string; thresholdsOverride?: { good?: number; warning?: number; critical?: number } | null },
  ) {
    if (!body.contextType || !body.contextId) {
      throw new BadRequestException('contextType et contextId sont requis');
    }
    return this.pinsService.createPin(request.user!.id, id, body.contextType, body.contextId, body.thresholdsOverride);
  }

  @Delete(':id/pins')
  @UseGuards(AuthGuard)
  async deletePin(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('contextType') contextType: IndicatorPinContextType,
    @Query('contextId') contextId: string,
  ) {
    if (!contextType || !contextId) {
      throw new BadRequestException('contextType et contextId sont requis');
    }
    await this.pinsService.deletePin(request.user!.id, id, contextType, contextId);
    return { success: true };
  }

  /** Liste toutes les notifications (onglet utilisateur à venir). */
  @Get('notifications/all')
  async getNotifications() {
    return this.indicatorsService.getNotifications();
  }

  // ── Feedbacks ──────────────────────────────────────────────────────────────

  /** Soumet (ou met à jour) un retour d'expérience pour un indicateur. */
  @Post(':id/feedback')
  async submitFeedback(
    @Param('id') id: string,
    @Body() body: { userId: string; rating: number; comment?: string },
  ) {
    return this.indicatorsService.submitFeedback(id, body.userId, body.rating, body.comment);
  }

  /** Liste tous les retours d'expérience d'un indicateur (admin). */
  @Get(':id/feedback')
  async getFeedbacks(@Param('id') id: string) {
    return this.indicatorsService.getFeedbacks(id);
  }

  /** Supprime un retour d'expérience (admin). */
  @Delete(':id/feedback/:feedbackId')
  @UseGuards(AuthGuard, AdminGuard)
  async deleteFeedback(
    @Param('id') id: string,
    @Param('feedbackId') feedbackId: string,
  ) {
    await this.indicatorsService.deleteFeedback(id, feedbackId);
    return { success: true };
  }
}
