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
import { IndicatorVisibilityGuard } from '../../core/guards/indicator-visibility.guard';
import { AuthGuard, AuthenticatedUser } from '../../core/auth/auth.guard';
import { CreateIndicatorDto, UpdateIndicatorDto, UpdateIndicatorStatusDto } from './dto/indicator.dto';

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

  // Lecture

  @Get()
  async getAllIndicators() {
    return this.indicatorsService.findAllActive();
  }

  // IMPORTANT : routes littérales avant /:id pour éviter les conflits
  @Get('all')
  @UseGuards(AuthGuard, AdminGuard)
  async getAllForAdmin() {
    return this.indicatorsService.findAllForAdmin();
  }

  // Recherche d'indicateurs similaires par nom/description (pour la détection de doublons)
  @Get('search')
  @UseGuards(AuthGuard, AdminGuard)
  async searchSimilar(
    @Query('q') q: string,
    @Query('excludeId') excludeId?: string,
  ) {
    if (!q?.trim()) return [];
    return this.indicatorsService.searchSimilar(q, excludeId);
  }

  // Retourne les tables PLaTon disponibles et leurs colonnes pour le builder
  @Get('schema')
  @UseGuards(AuthGuard, AdminGuard)
  async getPlatonSchema() {
    return this.indicatorsService.getPlatonSchema();
  }

  @Get('schema/full')
  @UseGuards(AuthGuard, AdminGuard)
  async getFullSchema() {
    return this.indicatorsService.getFullSchema();
  }

  /* Recherche des cours par nom (tout PLaTon) pour le sélecteur de test de formule - 10 résultats/page. */
  @Get('courses/search')
  @UseGuards(AuthGuard, AdminGuard)
  async searchCourses(@Query('q') q?: string, @Query('offset') offset?: string) {
    return this.indicatorsService.searchCourses(q ?? '', offset ? parseInt(offset, 10) : 0);
  }

  // Retourne les activités actives d'un cours
  @Get('course/:courseId/activities')
  @UseGuards(AuthGuard, AdminGuard)
  async getCourseActivities(@Param('courseId') courseId: string) {
    return this.indicatorsService.getCourseActivities(courseId);
  }

  // Retourne les étudiants d'un cours (pour le sélecteur de test de formule)
  @Get('course/:courseId/students')
  @UseGuards(AuthGuard, AdminGuard)
  async getCourseStudents(@Param('courseId') courseId: string) {
    return this.indicatorsService.getCourseStudents(courseId);
  }

  // Liste les indicateurs figés (pins enseignant) sur un cours/une activité précis
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

  /* Nombre de pins par indicateur (tous cours/activités confondus) pour le label "N pins" de la liste admin. */
  @Get('pins/counts')
  @UseGuards(AuthGuard)
  async countPinsByIndicator() {
    return this.pinsService.countPinsByIndicator();
  }

  @Get(':id')
  async getIndicator(@Param('id') id: string) {
    return this.indicatorsService.findById(id);
  }

  @Get(':id/values')
  @UseGuards(AuthGuard, IndicatorVisibilityGuard)
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
  @UseGuards(AuthGuard, AdminGuard)
  async getIndicatorUsage(@Param('id') id: string) {
    const indicator = await this.indicatorsService.findById(id);
    return { usageCount: indicator.usageCount };
  }

  @Get(':id/logs')
  @UseGuards(AuthGuard, AdminGuard)
  async getExecutionLogs(
    @Param('id') id: string,
    @Query('limit') limit = 50,
  ) {
    return this.indicatorsService.getExecutionLogs(id, +limit);
  }

  // Écriture

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  async createIndicator(@Body() definition: CreateIndicatorDto) {
    return this.indicatorsService.create(definition);
  }

  /* POST /:id/compute-view { contextType, contextId, activityId?, courseId? } - courseId pertinent seulement si group course-aware. */
  @Post(':id/compute-view')
  @UseGuards(AuthGuard, IndicatorVisibilityGuard)
  async computeView(
    @Param('id') id: string,
    @Body() body: { contextType: string; contextId: string; activityId?: string; vizId?: string; courseId?: string },
  ) {
    if (!body.contextType || !body.contextId) {
      throw new BadRequestException('contextType et contextId sont requis');
    }
    return this.indicatorsService.computeView(
      id, body.contextType, body.contextId, body.activityId, body.vizId, false, body.courseId,
    );
  }

  /* POST /preview { formula, context } : prévisualise un pipeline DSL sans persister (learner/group). */
  @Post('preview')
  @UseGuards(AuthGuard, AdminGuard)
  async previewFormula(
    @Body() body: {
      formula: any;
      context: { userId?: string; groupId?: string; activityId?: string; courseId?: string };
    },
  ) {
    return this.indicatorsService.preview(body.formula, body.context);
  }

  @Post('preview-steps')
  @UseGuards(AuthGuard, AdminGuard)
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
  async updateIndicator(@Param('id') id: string, @Body() data: UpdateIndicatorDto) {
    return this.indicatorsService.update(id, data);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard, AdminGuard)
  async toggleStatus(@Param('id') id: string, @Body() body: UpdateIndicatorStatusDto) {
    return this.indicatorsService.toggleStatus(id, body.isActive);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, AdminGuard)
  async deleteIndicator(@Param('id') id: string) {
    await this.indicatorsService.delete(id);
    return { success: true };
  }

  // Snapshots (comparaison groupes côte à côte)

  // Liste les snapshots d'un indicateur pour une activité ou un cours donné (l'un ou l'autre)
  @Get(':id/snapshots')
  @UseGuards(AuthGuard, IndicatorVisibilityGuard)
  async getSnapshots(
    @Param('id') id: string,
    @Query('activityId') activityId?: string,
    @Query('courseId') courseId?: string,
  ) {
    if (!activityId && !courseId) throw new BadRequestException('activityId ou courseId est requis');
    return this.indicatorsService.getSnapshots(id, activityId ? { activityId } : { courseId: courseId! });
  }

  // Crée un snapshot (groupe + activité OU groupe + cours). Retourne 409 si déjà existant
  @Post(':id/snapshots')
  @UseGuards(AuthGuard, IndicatorVisibilityGuard)
  async createSnapshot(
    @Param('id') id: string,
    @Body() body: { contextType: string; contextId: string; activityId?: string; courseId?: string; title: string },
  ) {
    if (!body.contextId || (!body.activityId && !body.courseId) || !body.title) {
      throw new BadRequestException('contextId, (activityId ou courseId) et title sont requis');
    }
    return this.indicatorsService.createSnapshot(id, { ...body, contextType: body.contextType ?? 'group' });
  }

  // Met à jour le titre d'un snapshot
  @Patch(':id/snapshots/:snapshotId')
  @UseGuards(AuthGuard, IndicatorVisibilityGuard)
  async updateSnapshotTitle(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
    @Body() body: { title: string },
  ) {
    if (!body.title?.trim()) throw new BadRequestException('title est requis');
    return this.indicatorsService.updateSnapshotTitle(id, snapshotId, body.title.trim());
  }

  // Supprime un snapshot
  @Delete(':id/snapshots/:snapshotId')
  @UseGuards(AuthGuard, IndicatorVisibilityGuard)
  async deleteSnapshot(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    await this.indicatorsService.deleteSnapshot(id, snapshotId);
    return { success: true };
  }

  // Notifications

  // Envoie une notification liée à un indicateur
  @Post(':id/notify')
  @UseGuards(AuthGuard, AdminGuard)
  async sendNotification(
    @Param('id') id: string,
    @Body() body: { title: string; message: string },
  ) {
    return this.indicatorsService.sendNotification(id, body.title, body.message);
  }

  /* Pins : pas d'AdminGuard, le contrôle fin (admin ou enseignant habilité) est fait dans assertCanManagePins. */

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

  // Liste toutes les notifications (onglet utilisateur à venir)
  @Get('notifications/all')
  @UseGuards(AuthGuard, AdminGuard)
  async getNotifications() {
    return this.indicatorsService.getNotifications();
  }

  // Feedbacks

  /* Soumet un retour d'expérience ; l'auteur est l'utilisateur du jeton, jamais un userId envoyé par le client. */
  @Post(':id/feedback')
  @UseGuards(AuthGuard)
  async submitFeedback(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { rating: number; comment?: string },
  ) {
    return this.indicatorsService.submitFeedback(id, request.user!.id, body.rating, body.comment);
  }

  // Liste tous les retours d'expérience d'un indicateur (admin)
  @Get(':id/feedback')
  @UseGuards(AuthGuard, AdminGuard)
  async getFeedbacks(@Param('id') id: string) {
    return this.indicatorsService.getFeedbacks(id);
  }

  // Supprime un retour d'expérience (admin)
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
