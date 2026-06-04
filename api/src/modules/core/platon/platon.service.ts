// src/modules/core/platon/platon.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PlatonService {
  private readonly logger = new Logger(PlatonService.name);

  constructor(
    @Inject('PLATON_DATA_SOURCE')
    private dataSource: DataSource,
  ) {}

  /**
   * Récupère les SessionData d'un utilisateur
   */
  async getUserSessionData(userId: string) {
    return this.dataSource.query(
      `SELECT 
         activity_id,
         grade,
         attempts,
         created_at
       FROM "SessionData"
       WHERE user_id = $1
       ORDER BY activity_id, created_at ASC`,
      [userId],
    );
  }

  /**
   * Récupère les SessionData d'un utilisateur pour une activité spécifique
   * Version corrigée - sans exercise_id (qui n'existe pas dans la table)
   */
  async getUserSessionDataByActivity(userId: string, activityId: string) {
    this.logger.log(` PlatonService.getUserSessionDataByActivity - userId: ${userId}, activityId: ${activityId}`);
    
    //  Correction: Supprimer "exercise_id" car il n'existe pas dans la table
    const query = `
      SELECT 
        sd."id",
        sd."activity_id",
        sd."grade",
        sd."attempts",
        sd."created_at",
        sd."resource_id"
      FROM "SessionData" sd
      WHERE sd."user_id" = $1 AND sd."activity_id" = $2
      ORDER BY sd."created_at" ASC
    `;
    
    this.logger.log(` Requête SQL: ${query.replace(/\s+/g, ' ').trim()}`);
    
    try {
      const result = await this.dataSource.query(query, [userId, activityId]);
      
      this.logger.log(` Résultat: ${result.length} enregistrements trouvés`);
      
      if (result.length > 0) {
        this.logger.log(` Premier enregistrement: grade=${result[0].grade}, attempts=${result[0].attempts}, resource_id=${result[0].resource_id}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`❌ Erreur dans getUserSessionDataByActivity: ${error.message}`);
      throw error;
    }
  }

  /**
   * Récupère tous les utilisateurs d'une activité
   */
  async getUsersByActivity(activityId: string) {
    return this.dataSource.query(
      `SELECT DISTINCT u.id, u.email, u.role, u.first_name, u.last_name
       FROM "Users" u
       JOIN "SessionData" sd ON sd."user_id" = u.id
       WHERE sd."activity_id" = $1`,
      [activityId],
    );
  }

  /**
   * Récupère les détails d'une activité
   */
  async getActivityDetails(activityId: string) {
    const result = await this.dataSource.query(
      `SELECT a.id,
              COALESCE(NULLIF(TRIM(a.source->'variables'->>'title'), ''), r.name, 'Activité sans titre') AS name,
              a.course_id
       FROM "Activities" a
       LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid
       WHERE a.id = $1`,
      [activityId],
    );
    return result[0];
  }

  /**
   * Récupère un utilisateur par son ID (tous les champs sauf password)
   */
  async getUserById(userId: string) {
    const result = await this.dataSource.query(
      `SELECT 
         id, 
         username, 
         first_name, 
         last_name, 
         active, 
         role, 
         email, 
         last_login, 
         first_login, 
         created_at, 
         updated_at, 
         discord_id, 
         last_activity
       FROM "Users" 
       WHERE id = $1`,
      [userId],
    );
    return result[0];
  }

  /**
   * Récupère tous les étudiants d'un enseignant
   */
  async getStudentsByTeacher(teacherId: string) {
    return this.dataSource.query(
      `SELECT u.id, u.email, u.first_name, u.last_name
       FROM "Users" u
       JOIN "UserGroups" ug ON ug.user_id = u.id
       JOIN "Groups" g ON g.id = ug.group_id
       WHERE g.teacher_id = $1 AND u.role = 'student'`,
      [teacherId],
    );
  }

  /**
   * Récupère tous les étudiants d'un cours
   */
  async getStudentsByCourse(courseId: string) {
    return this.dataSource.query(
      `SELECT u.id, u.email, u.first_name, u.last_name
       FROM "Users" u
       JOIN "CourseMembers" cm ON cm.user_id = u.id
       WHERE cm.course_id = $1 AND u.role = 'student'`,
      [courseId],
    );
  }

  /**
   * Récupère tous les IDs des utilisateurs (pour recalcule masse)
   */
  async getAllUserIds(): Promise<string[]> {
    const result = await this.dataSource.query(
      `SELECT id FROM "Users" WHERE active = true`,
    );
    return result.map((row: { id: string }) => row.id);
  }

  async getUserNameMap(userIds: string[]): Promise<Record<string, string>> {
    if (!userIds.length) return {};
    const rows = await this.dataSource.query(
      `SELECT id, first_name, last_name FROM "Users" WHERE id = ANY($1)`,
      [userIds],
    );
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.id] = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || row.id;
    }
    return map;
  }

  /**
   * Récupère tous les IDs des enseignants
   */
  async getAllTeacherIds(): Promise<string[]> {
    const result = await this.dataSource.query(
      `SELECT id FROM "Users" WHERE role = 'teacher' AND active = true`,
    );
    return result.map((row: { id: string }) => row.id);
  }

  /**
   * Récupère tous les IDs des cours
   */
  async getAllCourseIds(): Promise<string[]> {
    const result = await this.dataSource.query(
      `SELECT id FROM "Courses"`,
    );
    return result.map((row: { id: string }) => row.id);
  }

  /**
   * Récupère toutes les activités
   */
  async getAllActivities(): Promise<any[]> {
    return this.dataSource.query(
      `SELECT a.id,
              COALESCE(NULLIF(TRIM(a.source->'variables'->>'title'), ''), r.name, 'Activité sans titre') AS name,
              a.course_id
       FROM "Activities" a
       LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid`,
    );
  }

  // ── Groupes de TP ─────────────────────────────────────────────────────────

  /**
   * Retourne les IDs des étudiants membres d'un groupe de TP.
   * CourseGroupsMember.group_id (varchar) est lié à CourseGroups.group_id (varchar).
   * On filtre par CourseGroups.id (UUID) passé en paramètre.
   */
  async getUserIdsByGroup(groupId: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT cgm.user_id
       FROM "CourseGroupsMember" cgm
       JOIN "CourseGroups" cg ON cg.group_id = cgm.group_id
       WHERE cg.id = $1`,
      [groupId],
    );
    return rows.map((r: { user_id: string }) => r.user_id);
  }

  /**
   * Retourne les groupes de TP d'un enseignant (via owner_id sur Courses).
   */
  async getGroupsForTeacher(teacherId: string): Promise<{
    id: string;
    name: string;
    courseId: string;
    courseName: string;
  }[]> {
    const rows = await this.dataSource.query(
      `SELECT cg.id, cg.name, cg.course_id AS "courseId", c.name AS "courseName"
       FROM "CourseGroups" cg
       JOIN "Courses" c ON c.id = cg.course_id
       WHERE c.owner_id = $1
       ORDER BY c.name, cg.name`,
      [teacherId],
    );
    return rows;
  }

  /**
   * Équivalent de queryTable mais filtre les lignes dont user_id appartient
   * au groupe de TP identifié par groupId (UUID de CourseGroups).
   * Paramètre activityId requis : toutes les activités d'un même cours
   * sont partagées entre les groupes.
   */
  async queryTableForGroup(
    table: string,
    groupId: string,
    activityId: string,
    extraFilters: Record<string, string> = {},
    limit = 10000,
  ): Promise<any[]> {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw new Error(`Nom de table invalide : '${table}'`);
    }

    const conditions: string[] = [
      `"activity_id" = $1`,
      `"user_id" IN (
         SELECT cgm.user_id
         FROM "CourseGroupsMember" cgm
         JOIN "CourseGroups" cg ON cg.group_id = cgm.group_id
         WHERE cg.id = $2
       )`,
    ];
    const params: any[] = [activityId, groupId];
    let idx = 3;

    for (const [col, val] of Object.entries(extraFilters)) {
      if (val === undefined || val === null) continue;
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) continue;
      conditions.push(`"${col}" = $${idx++}`);
      params.push(val);
    }

    return this.dataSource.query(
      `SELECT * FROM "${table}" WHERE ${conditions.join(' AND ')} LIMIT ${limit}`,
      params,
    );
  }

  // ── Contexte enseignant ───────────────────────────────────────────────────

  /**
   * Retourne les cours d'un enseignant avec leurs groupes de TP.
   */
  async getCoursesWithGroupsForTeacher(teacherId: string): Promise<{
    id: string;
    name: string;
    groups: { id: string; name: string }[];
  }[]> {
    const courses = await this.dataSource.query(
      `SELECT id, name FROM "Courses" WHERE owner_id = $1 ORDER BY name`,
      [teacherId],
    );
    for (const course of courses) {
      course.groups = await this.dataSource.query(
        `SELECT id, name FROM "CourseGroups" WHERE course_id = $1 ORDER BY name`,
        [course.id],
      );
    }
    return courses;
  }

  /**
   * Retourne les activités d'un cours.
   * Titre : source->'variables'->>'title', sinon Resources.name (même logique que PLaTon),
   * sinon fallback littéral.
   */
  async getActivitiesByCourse(courseId: string): Promise<{ id: string; name: string }[]> {
    return this.dataSource.query(
      `SELECT a.id,
              COALESCE(
                NULLIF(TRIM(a.source->'variables'->>'title'), ''),
                r.name,
                'Activité sans titre'
              ) AS name
       FROM "Activities" a
       LEFT JOIN "Resources" r ON r.id = (a.source->>'resource')::uuid
       WHERE a.course_id = $1
       ORDER BY name`,
      [courseId],
    );
  }

  // ── Schéma dynamique ──────────────────────────────────────────────────────

  async getAvailableTables(): Promise<{ name: string; columns: { name: string; type: string }[] }[]> {
    const rows: { table_name: string; column_name: string; data_type: string }[] =
      await this.dataSource.query(
        `SELECT table_name, column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`,
      );

    const map = new Map<string, { name: string; type: string }[]>();
    for (const row of rows) {
      if (!map.has(row.table_name)) map.set(row.table_name, []);
      map.get(row.table_name)!.push({ name: row.column_name, type: row.data_type });
    }

    return Array.from(map.entries()).map(([name, columns]) => ({ name, columns }));
  }

  async queryTable(
    table: string,
    contextFilters: Record<string, string>,
    limit = 10000,
  ): Promise<any[]> {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw new Error(`Nom de table invalide : '${table}'`);
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [col, val] of Object.entries(contextFilters)) {
      if (val === undefined || val === null) continue;
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) continue; // sécurité
      conditions.push(`"${col}" = $${idx++}`);
      params.push(val);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.dataSource.query(
      `SELECT * FROM "${table}" ${where} LIMIT ${limit}`,
      params,
    );
  }
}