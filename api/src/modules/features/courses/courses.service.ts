import { Injectable, Inject, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

const VALID_MEMBER_ROLES = ['student', 'teacher'];

@Injectable()
export class CoursesService {
  constructor(
    @Inject('PLATON_DATA_SOURCE')
    private readonly dataSource: DataSource,
  ) {}

  async searchCourses(filters: {
    search?: string;
    members?: string | string[];
    period?: string;
    offset?: string;
    limit?: string;
    order?: string;
    direction?: string;
  }) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.search) {
      conditions.push(`LOWER(c.name) LIKE LOWER($${idx++})`);
      params.push(`%${filters.search}%`);
    }

    if (filters.members) {
      const members = Array.isArray(filters.members) ? filters.members : [filters.members];
      conditions.push(`(
        c.owner_id = ANY($${idx})
        OR c.id IN (SELECT course_id FROM "CourseMembers" WHERE user_id = ANY($${idx}))
      )`);
      params.push(members);
      idx++;
    }

    if (filters.period) {
      const days = parseInt(filters.period, 10);
      if (!isNaN(days) && days > 0) {
        conditions.push(`c.updated_at >= NOW() - INTERVAL '${days} days'`);
      }
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const orderField = this.orderFieldFor(filters.order);
    const orderDir = (filters.direction ?? '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const limit = Math.min(parseInt(filters.limit ?? '50', 10) || 50, 200);
    const offset = parseInt(filters.offset ?? '0', 10) || 0;

    const baseParams = [...params];

    const countResult: { total: string }[] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT c.id)::text AS total FROM "Courses" c ${where}`,
      baseParams,
    );

    const listParams = [...params, limit, offset];
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT DISTINCT ON (c.id)
         c.id, c.name, c.desc, c.owner_id AS "ownerId", c.is_test AS "isTest",
         c.created_at AS "createdAt", c.updated_at AS "updatedAt",
         TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS "ownerName",
         (SELECT COUNT(*)::int FROM "CourseMembers" cm WHERE cm.course_id = c.id AND cm.role = 'student') AS "studentCount",
         (SELECT COUNT(*)::int FROM "CourseMembers" cm WHERE cm.course_id = c.id AND cm.role = 'teacher') AS "teacherCount",
         (SELECT COUNT(*)::int FROM "Activities" a WHERE a.course_id = c.id) AS "activityCount",
         (
           SELECT COALESCE(ROUND(AVG(s.grade)), 0)::int
           FROM "Sessions" s
           JOIN "Activities" a_s ON a_s.id = s.activity_id
           WHERE s.parent_id IS NOT NULL AND a_s.course_id = c.id AND s.grade >= 0
         ) AS "progression",
         (
           SELECT COALESCE(ROUND(AVG(LEAST(EXTRACT(EPOCH FROM (s.last_graded_at - s.started_at)), 28800))), 0)::int
           FROM "Sessions" s
           JOIN "Activities" a_s ON a_s.id = s.activity_id
           WHERE s.parent_id IS NULL AND a_s.course_id = c.id
             AND s.last_graded_at IS NOT NULL AND s.started_at IS NOT NULL
         ) AS "timeSpent"
       FROM "Courses" c
       LEFT JOIN "Users" u ON u.id = c.owner_id
       ${where}
       ORDER BY c.id, ${orderField} ${orderDir}
       LIMIT $${idx++} OFFSET $${idx++}`,
      listParams,
    );

    return {
      // Liste de cours : les actions d'édition ne s'affichent pas ici, pas besoin du détail des permissions.
      resources: rows.map((r) => this.mapCourse(r, { update: false, delete: false })),
      total: parseInt(countResult[0]?.total ?? '0', 10),
    };
  }

  async findCourseById(id: string, userId?: string) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         c.id, c.name, c.desc, c.owner_id AS "ownerId", c.is_test AS "isTest",
         c.created_at AS "createdAt", c.updated_at AS "updatedAt",
         TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS "ownerName",
         (SELECT COUNT(*)::int FROM "CourseMembers" cm WHERE cm.course_id = c.id AND cm.role = 'student') AS "studentCount",
         (SELECT COUNT(*)::int FROM "CourseMembers" cm WHERE cm.course_id = c.id AND cm.role = 'teacher') AS "teacherCount",
         (SELECT COUNT(*)::int FROM "Activities" a WHERE a.course_id = c.id) AS "activityCount",
         (
           SELECT COALESCE(ROUND(AVG(s.grade)), 0)::int
           FROM "Sessions" s
           JOIN "Activities" a_s ON a_s.id = s.activity_id
           WHERE s.parent_id IS NOT NULL AND a_s.course_id = c.id AND s.grade >= 0
         ) AS "progression",
         (
           SELECT COALESCE(ROUND(AVG(LEAST(EXTRACT(EPOCH FROM (s.last_graded_at - s.started_at)), 28800))), 0)::int
           FROM "Sessions" s
           JOIN "Activities" a_s ON a_s.id = s.activity_id
           WHERE s.parent_id IS NULL AND a_s.course_id = c.id
             AND s.last_graded_at IS NOT NULL AND s.started_at IS NOT NULL
         ) AS "timeSpent"
       FROM "Courses" c
       LEFT JOIN "Users" u ON u.id = c.owner_id
       WHERE c.id = $1`,
      [id],
    );

    if (!rows.length) throw new NotFoundException(`Course not found: ${id}`);
    const row = rows[0];
    const permissions = await this.computeCoursePermissions(row.ownerId as string, id, userId);
    return { resource: this.mapCourse(row, permissions) };
  }

  /** Réplique la règle PLaTon : update = owner OU admin global OU membre "teacher" du cours.
   *  delete = owner OU admin global uniquement (teacher membre ne suffit pas). */
  private async computeCoursePermissions(
    ownerId: string,
    courseId: string,
    userId?: string,
  ): Promise<{ update: boolean; delete: boolean }> {
    if (!userId) return { update: false, delete: false };
    if (userId === ownerId) return { update: true, delete: true };

    const userRows: { role: string }[] = await this.dataSource.query(
      `SELECT role FROM "Users" WHERE id = $1`,
      [userId],
    );
    if (userRows[0]?.role === 'admin') return { update: true, delete: true };

    const teacherRows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM "CourseMembers" WHERE course_id = $1 AND user_id = $2 AND role = 'teacher'`,
      [courseId, userId],
    );
    return { update: teacherRows.length > 0, delete: false };
  }

  private async hasActivityWritePermission(courseId: string, userId?: string): Promise<boolean> {
    if (!userId) return false;
    const userRows: { role: string }[] = await this.dataSource.query(
      `SELECT role FROM "Users" WHERE id = $1`,
      [userId],
    );
    if (userRows[0]?.role === 'admin') return true;
    const teacherRows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM "CourseMembers" WHERE course_id = $1 AND user_id = $2 AND role = 'teacher'`,
      [courseId, userId],
    );
    return teacherRows.length > 0;
  }

  async listMembers(courseId: string, filters: { roles?: string; role?: string; search?: string }) {
    const conditions: string[] = ['cm.course_id = $1'];
    const params: unknown[] = [courseId];
    let idx = 2;

    if (filters.roles) {
      const roles = filters.roles.split(',');
      conditions.push(`cm.role = ANY($${idx++})`);
      params.push(roles);
    } else if (filters.role) {
      conditions.push(`cm.role = $${idx++}`);
      params.push(filters.role);
    }

    if (filters.search) {
      conditions.push(`(
        LOWER(u.first_name) LIKE LOWER($${idx})
        OR LOWER(u.last_name) LIKE LOWER($${idx})
        OR LOWER(u.username) LIKE LOWER($${idx})
      )`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         cm.id, cm.course_id AS "courseId", cm.user_id AS "userId", cm.role,
         cm.created_at AS "createdAt",
         u.username, u.first_name AS "firstName", u.last_name AS "lastName"
       FROM "CourseMembers" cm
       LEFT JOIN "Users" u ON u.id = cm.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY cm.role, u.last_name ASC`,
      params,
    );

    return {
      resources: rows.map((r) => ({
        id: r.id,
        courseId: r.courseId,
        userId: r.userId,
        role: r.role,
        createdAt: r.createdAt,
        user: r.userId ? {
          id: r.userId,
          username: r.username,
          firstName: r.firstName,
          lastName: r.lastName,
          displayName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.username,
        } : null,
      })),
      total: rows.length,
    };
  }

  /** Un seul membre, hydraté avec les infos utilisateur (même forme que listMembers). */
  private async getMemberById(memberId: string): Promise<Record<string, unknown> | null> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         cm.id, cm.course_id AS "courseId", cm.user_id AS "userId", cm.role,
         cm.created_at AS "createdAt",
         u.username, u.first_name AS "firstName", u.last_name AS "lastName"
       FROM "CourseMembers" cm
       LEFT JOIN "Users" u ON u.id = cm.user_id
       WHERE cm.id = $1`,
      [memberId],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      courseId: r.courseId,
      userId: r.userId,
      role: r.role,
      createdAt: r.createdAt,
      user: r.userId ? {
        id: r.userId,
        username: r.username,
        firstName: r.firstName,
        lastName: r.lastName,
        displayName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.username,
      } : null,
    };
  }

  async createMember(courseId: string, input: { userId: string; role: string }, actingUserId?: string) {
    if (!(await this.hasActivityWritePermission(courseId, actingUserId))) {
      throw new ForbiddenException("Droit d'écriture requis sur ce cours pour ajouter un membre");
    }
    if (!VALID_MEMBER_ROLES.includes(input.role)) {
      throw new ConflictException(`Rôle invalide : "${input.role}"`);
    }
    try {
      const rows = await this.dataSource.query(
        `INSERT INTO "CourseMembers" (user_id, course_id, role) VALUES ($1, $2, $3) RETURNING id`,
        [input.userId, courseId, input.role],
      );
      return this.getMemberById(rows[0].id);
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') {
        throw new ConflictException('Cet utilisateur est déjà membre de ce cours');
      }
      throw err;
    }
  }

  async deleteMember(courseId: string, memberId: string, actingUserId?: string): Promise<void> {
    if (!(await this.hasActivityWritePermission(courseId, actingUserId))) {
      throw new ForbiddenException("Droit d'écriture requis sur ce cours pour retirer un membre");
    }
    await this.dataSource.query(
      `DELETE FROM "CourseMembers" WHERE id = $1 AND course_id = $2`,
      [memberId, courseId],
    );
  }

  async updateMemberRole(courseId: string, memberId: string, role: string, actingUserId?: string) {
    if (!(await this.hasActivityWritePermission(courseId, actingUserId))) {
      throw new ForbiddenException("Droit d'écriture requis sur ce cours pour changer un rôle");
    }
    if (!VALID_MEMBER_ROLES.includes(role)) {
      throw new ConflictException(`Rôle invalide : "${role}"`);
    }
    const rows = await this.dataSource.query(
      `UPDATE "CourseMembers" SET role = $1, updated_at = now() WHERE id = $2 AND course_id = $3 RETURNING id`,
      [role, memberId, courseId],
    );
    if (!rows.length) throw new NotFoundException('Membre introuvable');
    return this.getMemberById(rows[0].id);
  }

  async listGroups(courseId: string) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         cg.id, cg.group_id AS "groupId", cg.course_id AS "courseId",
         cg.name, cg.created_at AS "createdAt"
       FROM "CourseGroups" cg
       WHERE cg.course_id = $1
       ORDER BY cg.created_at ASC`,
      [courseId],
    );
    return { resources: rows, total: rows.length };
  }

  async listGroupMembers(courseId: string, groupId: string) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         cgm.user_id AS "userId",
         cgm.group_id AS "groupId",
         cm.id,
         cm.course_id AS "courseId",
         cm.role,
         cgm.created_at AS "createdAt",
         u.username,
         u.first_name AS "firstName",
         u.last_name AS "lastName"
       FROM "CourseGroupsMember" cgm
       LEFT JOIN "Users" u ON u.id = cgm.user_id
       LEFT JOIN "CourseMembers" cm ON cm.user_id = cgm.user_id AND cm.course_id = $1
       WHERE cgm.group_id = $2
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [courseId, groupId],
    );
    return {
      resources: rows.map((r) => ({
        id: r.id ?? r.userId,
        courseId: r.courseId ?? courseId,
        userId: r.userId,
        role: r.role ?? 'student',
        createdAt: r.createdAt,
        user: r.userId ? {
          id: r.userId,
          username: r.username,
          firstName: r.firstName,
          lastName: r.lastName,
          displayName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.username,
        } : null,
      })),
      total: rows.length,
    };
  }

  async listSections(courseId: string) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         s.id, s.name, s.order, s.desc,
         s.course_id AS "courseId",
         s.created_at AS "createdAt", s.updated_at AS "updatedAt"
       FROM "CourseSections" s
       WHERE s.course_id = $1
       ORDER BY s.order ASC, s.created_at ASC`,
      [courseId],
    );

    return { resources: rows, total: rows.length };
  }

  async listActivities(courseId: string, filters: { sectionId?: string; challenge?: string }, userId?: string) {
    const conditions = ['a.course_id = $1'];
    const params: unknown[] = [courseId];
    let idx = 2;

    if (filters.sectionId) {
      conditions.push(`a.section_id = $${idx++}`);
      params.push(filters.sectionId);
    }

    if (filters.challenge === 'true' || filters.challenge === '1') {
      conditions.push('a.is_challenge = true');
    }

    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         a.id,
         a.course_id AS "courseId",
         a.section_id AS "sectionId",
         a.open_at AS "openAt",
         a.close_at AS "closeAt",
         a.is_challenge AS "isChallenge",
         a.order,
         a.color_hue AS "colorHue",
         a.created_at AS "createdAt",
         a.updated_at AS "updatedAt",
         COALESCE(
           NULLIF(TRIM(a.source->'variables'->>'title'), ''),
           r.name,
           'Activité sans titre'
         ) AS title,
         (a.source->>'resource')::text AS "resourceId",
         (a.source->'variables'->'settings'->'navigation'->>'mode' = 'peer')::boolean AS "isPeerComparison"
       FROM "Activities" a
       LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.order ASC, a.created_at ASC`,
      params,
    );

    if (!rows.length) return { resources: [], total: 0 };

    const activityIds = rows.map((r) => r.id as string);

    const [progressionRows, timeSpentRows, exerciseCountRows]: [
      { activity_id: string; progression: number }[],
      { activity_id: string; timeSpent: number }[],
      { activity_id: string; exerciseCount: number }[],
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT s.activity_id::text, ROUND(AVG(s.grade))::int AS progression
         FROM "Sessions" s
         WHERE s.parent_id IS NOT NULL
           AND s.activity_id = ANY($1::uuid[])
           AND s.grade >= 0
         GROUP BY s.activity_id`,
        [activityIds],
      ),
      this.dataSource.query(
        `SELECT s.activity_id::text,
                ROUND(AVG(LEAST(EXTRACT(EPOCH FROM (s.last_graded_at - s.started_at)), 28800)))::int AS "timeSpent"
         FROM "Sessions" s
         WHERE s.parent_id IS NULL
           AND s.activity_id = ANY($1::uuid[])
           AND s.last_graded_at IS NOT NULL
           AND s.started_at IS NOT NULL
         GROUP BY s.activity_id`,
        [activityIds],
      ),
      this.dataSource.query(
        `SELECT activity_id::text, COUNT(DISTINCT resource_id)::int AS "exerciseCount"
         FROM "SessionData"
         WHERE activity_id = ANY($1::uuid[])
         GROUP BY activity_id`,
        [activityIds],
      ),
    ]);

    const progressionMap = new Map(progressionRows.map((r) => [r.activity_id, r.progression]));
    const timeSpentMap = new Map(timeSpentRows.map((r) => [r.activity_id, r.timeSpent]));
    const exerciseCountMap = new Map(exerciseCountRows.map((r) => [r.activity_id, r.exerciseCount]));
    const activityPermissions = await this.hasActivityWritePermission(courseId, userId);

    return {
      resources: rows.map((r) =>
        this.mapActivity(r, progressionMap, timeSpentMap, exerciseCountMap, activityPermissions),
      ),
      total: rows.length,
    };
  }

  private mapCourse(r: Record<string, unknown>, permissions: { update: boolean; delete: boolean }) {
    return {
      id: r.id,
      name: r.name,
      desc: r.desc,
      ownerId: r.ownerId,
      ownerName: r.ownerName || r.ownerId,
      isTest: r.isTest,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      statistic: {
        studentCount: r.studentCount ?? 0,
        teacherCount: r.teacherCount ?? 0,
        activityCount: r.activityCount ?? 0,
        progression: r.progression ?? 0,
        timeSpent: r.timeSpent ?? 0,
        challengeCount: 0,
      },
      permissions,
    };
  }

  private mapActivity(
    r: Record<string, unknown>,
    progressionMap?: Map<string, number>,
    timeSpentMap?: Map<string, number>,
    exerciseCountMap?: Map<string, number>,
    hasWritePermission = false,
  ) {
    const now = new Date();
    const openAt = r.openAt ? new Date(r.openAt as string) : null;
    const closeAt = r.closeAt ? new Date(r.closeAt as string) : null;

    let state: 'opened' | 'closed' | 'planned' = 'opened';
    if (closeAt && closeAt < now) state = 'closed';
    else if (openAt && openAt > now) state = 'planned';

    return {
      id: r.id,
      courseId: r.courseId,
      sectionId: r.sectionId,
      openAt: r.openAt,
      closeAt: r.closeAt,
      isChallenge: r.isChallenge ?? false,
      isPeerComparison: r.isPeerComparison ?? false,
      order: r.order ?? 0,
      colorHue: r.colorHue,
      title: r.title ?? 'Activité sans titre',
      resourceId: r.resourceId,
      exerciseCount: exerciseCountMap?.get(r.id as string) ?? 0,
      state,
      timeSpent: timeSpentMap?.get(r.id as string) ?? 0,
      progression: progressionMap?.get(r.id as string) ?? 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      permissions: {
        answer: true,
        update: hasWritePermission,
        // Un étudiant doit pouvoir consulter les statistiques de ses propres
        // activités, pas seulement l'enseignant - contrairement à update/
        // viewResource, qui restent réservés à l'admin/enseignant du cours.
        viewStats: true,
        viewResource: hasWritePermission,
      },
    };
  }

  async findActivity(courseId: string, activityId: string, userId?: string) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         a.id,
         a.course_id AS "courseId",
         a.section_id AS "sectionId",
         a.open_at AS "openAt",
         a.close_at AS "closeAt",
         a.is_challenge AS "isChallenge",
         a.order,
         a.color_hue AS "colorHue",
         a.created_at AS "createdAt",
         a.updated_at AS "updatedAt",
         COALESCE(NULLIF(TRIM(a.source->'variables'->>'title'), ''), r.name, 'Activité sans titre') AS title,
         (a.source->>'resource')::text AS "resourceId",
         (a.source->'variables'->'settings'->'navigation'->>'mode' = 'peer')::boolean AS "isPeerComparison"
       FROM "Activities" a
       LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid
       WHERE a.course_id = $1 AND a.id = $2`,
      [courseId, activityId],
    );
    if (!rows.length) throw new Error(`Activity not found: ${activityId}`);
    const hasWritePermission = await this.hasActivityWritePermission(courseId, userId);
    return { resource: this.mapActivity(rows[0], undefined, undefined, undefined, hasWritePermission) };
  }

  async getActivityResults(activityId: string) {
    // Per-exercise aggregated stats
    const exerciseRows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         sd.resource_id AS "resourceId",
         COALESCE(r.name, sd.resource_id::text, 'Exercice') AS "title",
         COUNT(DISTINCT sd.user_id)::int AS "userCount",
         ROUND(AVG(sd.grade)::numeric, 2)::float AS "avgGrade",
         ROUND(AVG(sd.attempts)::numeric, 2)::float AS "avgAttempts",
         COUNT(CASE WHEN sd.grade >= 100 THEN 1 END)::float / NULLIF(COUNT(*), 0) AS "successRate",
         COUNT(CASE WHEN sd.attempts > 0 THEN 1 END)::float / NULLIF(COUNT(*), 0) AS "answerRate",
         COUNT(CASE WHEN sd.grade > 0 AND sd.grade < 100 THEN 1 END)::float / NULLIF(COUNT(*), 0) AS "partSuccRate",
         COUNT(CASE WHEN sd.attempts > 0 AND sd.grade = 0 THEN 1 END)::float / NULLIF(COUNT(*), 0) AS "failRate",
         array_agg(sd.grade ORDER BY sd.grade) AS "grades"
       FROM "SessionData" sd
       LEFT JOIN "Resources" r ON r.id = sd.resource_id
       WHERE sd.activity_id = $1
       GROUP BY sd.resource_id, r.name`,
      [activityId],
    );

    // Per-user aggregated stats
    const userRows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         u.id, u.username, u.first_name AS "firstName", u.last_name AS "lastName",
         COALESCE(u.email, '') AS email,
         ROUND(AVG(sd.grade)::numeric, 1)::float AS "avgGrade",
         SUM(sd.attempts)::int AS "totalAttempts",
         json_agg(json_build_object(
           'resourceId', sd.resource_id::text,
           'title', COALESCE(r.name, sd.resource_id::text, 'Exercice'),
           'grade', sd.grade,
           'attempts', sd.attempts,
           'state', CASE
             WHEN sd.grade >= 100 THEN 'SUCCEEDED'
             WHEN sd.grade > 0 THEN 'PART_SUCC'
             WHEN sd.attempts > 0 THEN 'FAILED'
             ELSE 'NOT_STARTED'
           END
         ) ORDER BY r.name) AS exercises
       FROM "SessionData" sd
       JOIN "Users" u ON u.id = sd.user_id
       LEFT JOIN "Resources" r ON r.id = sd.resource_id
       WHERE sd.activity_id = $1
       GROUP BY u.id, u.username, u.first_name, u.last_name, u.email`,
      [activityId],
    );

    // Top-level stats
    const statsRows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         ROUND(AVG(sub.avg_grade)::numeric, 1)::float AS "averageScore",
         ROUND(AVG(sub.total_attempts)::numeric, 1)::float AS "averageDuration",
         COUNT(CASE WHEN sub.avg_grade >= 100 THEN 1 END)::float / NULLIF(COUNT(*), 0) AS "successRate",
         COUNT(CASE WHEN sub.total_attempts > 0 THEN 1 END)::float / NULLIF(COUNT(*), 0) AS "answerRate",
         COUNT(CASE WHEN sub.total_attempts > 0 AND sub.avg_grade < 100 THEN 1 END)::float / NULLIF(COUNT(*), 0) AS "dropoutRate"
       FROM (
         SELECT user_id, AVG(grade) AS avg_grade, SUM(attempts) AS total_attempts
         FROM "SessionData"
         WHERE activity_id = $1
         GROUP BY user_id
       ) sub`,
      [activityId],
    );

    const stats = statsRows[0] ?? {};

    const exercises = exerciseRows.map((e) => ({
      id: e.resourceId,
      title: e.title,
      states: {
        ANSWERED: 0,
        SUCCEEDED: Math.round(((e.successRate as number) ?? 0) * ((e.userCount as number) ?? 0)),
        PART_SUCC: Math.round(((e.partSuccRate as number) ?? 0) * ((e.userCount as number) ?? 0)),
        FAILED: Math.round(((e.failRate as number) ?? 0) * ((e.userCount as number) ?? 0)),
        STARTED: 0,
        NOT_STARTED: 0,
        ERROR: 0,
      },
      grades: { sum: 0, avg: e.avgGrade ?? 0, count: e.userCount ?? 0 },
      attempts: { sum: 0, avg: e.avgAttempts ?? 0, count: e.userCount ?? 0 },
      durations: { sum: 0, avg: 0, count: 0 },
      answerRate: { sum: 0, avg: Math.round(((e.answerRate as number) ?? 0) * 100), count: e.userCount ?? 0, isRate: true },
      successRate: { sum: 0, avg: Math.round(((e.successRate as number) ?? 0) * 100), count: e.userCount ?? 0, isRate: true },
      dropoutRate: { sum: 0, avg: 0, count: 0, isRate: true },
      averageTimeToAttempt: { sum: 0, avg: 0, count: 0 },
      averageAttemptsToSuccess: { sum: 0, avg: 0, count: 0 },
      successRateOnFirstAttempt: { sum: 0, avg: 0, count: 0, isRate: true },
      details: (e.grades as number[]) ?? [],
    }));

    const users = userRows.map((u) => ({
      id: u.id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      correcting: false,
      exercises: Object.fromEntries(
        ((u.exercises as Array<Record<string, unknown>>) ?? []).map((ex) => [
          ex.resourceId as string,
          {
            id: ex.resourceId,
            title: ex.title,
            state: ex.state,
            grade: ex.grade,
            attempts: ex.attempts,
            duration: 0,
          },
        ]),
      ),
    }));

    return {
      averageScore: (stats.averageScore as number) ?? 0,
      averageDuration: (stats.averageDuration as number) ?? 0,
      successRate: Math.round(((stats.successRate as number) ?? 0) * 100),
      answerRate: Math.round(((stats.answerRate as number) ?? 0) * 100),
      dropoutRate: Math.round(((stats.dropoutRate as number) ?? 0) * 100),
      exercises,
      users,
    };
  }

  async getActivityResultsForDate(activityId: string, startDate: string, endDate: string) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         u.id, u.username, u.first_name AS "firstName", u.last_name AS "lastName",
         TO_CHAR(DATE(sd.created_at), 'YYYY-MM-DD') AS "date",
         COUNT(CASE WHEN sd.grade >= 100 THEN 1 END)::int AS "nbSuccess"
       FROM "SessionData" sd
       JOIN "Users" u ON u.id = sd.user_id
       WHERE sd.activity_id = $1
         AND sd.created_at >= $2::timestamp
         AND sd.created_at <= $3::timestamp
       GROUP BY u.id, u.username, u.first_name, u.last_name, DATE(sd.created_at)
       ORDER BY u.id, DATE(sd.created_at)`,
      [activityId, startDate, endDate],
    );

    // Group by user, build nbSuccess map: date → count
    const userMap = new Map<string, { id: string; username: string; firstName: string; lastName: string; nbSuccess: Record<string, number> }>();
    for (const row of rows) {
      const id = row.id as string;
      if (!userMap.has(id)) {
        userMap.set(id, {
          id,
          username: row.username as string,
          firstName: row.firstName as string,
          lastName: row.lastName as string,
          nbSuccess: {},
        });
      }
      const user = userMap.get(id)!;
      user.nbSuccess[row.date as string] = (row.nbSuccess as number) ?? 0;
    }

    return Array.from(userMap.values());
  }

  async getActivityCsv(activityId: string): Promise<string> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         u.username, u.first_name AS "firstName", u.last_name AS "lastName",
         r.name AS "exerciseName",
         sd.grade, sd.attempts,
         TO_CHAR(sd.created_at, 'YYYY-MM-DD HH24:MI') AS "date"
       FROM "SessionData" sd
       JOIN "Users" u ON u.id = sd.user_id
       LEFT JOIN "Resources" r ON r.id = sd.resource_id
       WHERE sd.activity_id = $1
       ORDER BY u.last_name, u.first_name, r.name`,
      [activityId],
    );

    const headers = ['Nom', 'Prénom', 'Nom d\'utilisateur', 'Exercice', 'Note', 'Tentatives', 'Date'];
    const csvRows = rows.map((r) => [
      r.lastName ?? '',
      r.firstName ?? '',
      r.username ?? '',
      r.exerciseName ?? 'Inconnu',
      r.grade ?? 0,
      r.attempts ?? 0,
      r.date ?? '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));

    return [headers.join(','), ...csvRows].join('\n');
  }

  private orderFieldFor(order?: string): string {
    const map: Record<string, string> = {
      NAME: 'c.name',
      CREATED_AT: 'c.created_at',
      UPDATED_AT: 'c.updated_at',
    };
    return map[(order ?? '').toUpperCase()] ?? 'c.updated_at';
  }
}
