import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

interface ResourceFilters {
  search?: string;
  types?: string | string[];
  status?: string | string[];
  owners?: string | string[];
  parents?: string | string[];
  personal?: string;
  views?: string;
  period?: string;
  offset?: string;
  limit?: string;
  order?: string;
  direction?: string;
}

@Injectable()
export class ResourcesService {
  constructor(
    @Inject('PLATON_DATA_SOURCE')
    private readonly dataSource: DataSource,
  ) {}

  async searchResources(filters: ResourceFilters) {
    // views=true: recently viewed - return recent resources ordered by updated_at
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.search) {
      conditions.push(`(LOWER(r.name) LIKE LOWER($${idx}) OR LOWER(COALESCE(r.desc, '')) LIKE LOWER($${idx}))`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const types = this.toArray(filters.types);
    if (types.length) {
      conditions.push(`r.type = ANY($${idx++})`);
      params.push(types);
    }

    const status = this.toArray(filters.status);
    if (status.length) {
      conditions.push(`r.status = ANY($${idx++})`);
      params.push(status);
    }

    const owners = this.toArray(filters.owners);
    if (owners.length) {
      conditions.push(`r.owner_id = ANY($${idx++})`);
      params.push(owners);
    }

    const parents = this.toArray(filters.parents);
    if (parents.length) {
      conditions.push(`r.parent_id = ANY($${idx++})`);
      params.push(parents);
    }

    if (filters.personal === 'true') {
      conditions.push('r.personal = true');
    } else if (filters.personal === 'false') {
      conditions.push('r.personal = false');
    }

    if (filters.period) {
      const days = parseInt(filters.period, 10);
      if (!isNaN(days) && days > 0) {
        conditions.push(`r.updated_at >= NOW() - INTERVAL '${days} days'`);
      }
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const orderField = this.orderFieldFor(filters.order);
    const orderDir = (filters.direction ?? '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const limit = Math.min(parseInt(filters.limit ?? '50', 10) || 50, 200);
    const offset = parseInt(filters.offset ?? '0', 10) || 0;

    const countResult: { total: string }[] = await this.dataSource.query(
      `SELECT COUNT(*)::text AS total FROM "Resources" r ${where}`,
      [...params],
    );

    const listParams = [...params, limit, offset];
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         r.id, r.name, r.desc, r.type, r.status,
         r.owner_id AS "ownerId",
         r.parent_id AS "parentId",
         r.personal,
         r.template_id AS "templateId",
         r.template_version AS "templateVersion",
         r.public_preview AS "publicPreview",
         r.created_at AS "createdAt",
         r.updated_at AS "updatedAt"
       FROM "Resources" r
       ${where}
       ORDER BY ${orderField} ${orderDir}
       LIMIT $${idx++} OFFSET $${idx++}`,
      listParams,
    );

    return {
      resources: rows.map((r) => this.mapResource(r)),
      total: parseInt(countResult[0]?.total ?? '0', 10),
    };
  }

  async findResourceById(id: string, userId?: string) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         r.id, r.name, r.desc, r.type, r.status,
         r.owner_id AS "ownerId",
         r.parent_id AS "parentId",
         r.personal,
         r.template_id AS "templateId",
         r.template_version AS "templateVersion",
         r.public_preview AS "publicPreview",
         r.created_at AS "createdAt",
         r.updated_at AS "updatedAt"
       FROM "Resources" r
       WHERE r.id::text = $1 OR r.code = $1`,
      [id],
    );

    if (!rows.length) throw new NotFoundException(`Resource not found: ${id}`);
    const row = rows[0];
    const permissions = await this.computeResourcePermissions(
      {
        id: row.id as string,
        type: row.type as string,
        parentId: row.parentId as string | null,
        ownerId: row.ownerId as string,
        personal: row.personal as boolean,
      },
      userId,
    );
    return { resource: this.mapResource(row, permissions) };
  }

  /**
   * Réplique la règle PLaTon (permissions.service.ts#userPermissionsOnResource) :
   * write = owner du cercle OU (admin global ET cercle non personnel) OU membre accepté du cercle
   *         OU owner/membre accepté d'un cercle ancêtre. member/watcher/waiting portent sur la
   *         ressource elle-même (pas sur le cercle).
   */
  private async computeResourcePermissions(
    resource: { id: string; type: string; parentId: string | null; ownerId: string; personal: boolean },
    userId?: string,
  ): Promise<{ read: boolean; write: boolean; member: boolean; watcher: boolean; waiting: boolean }> {
    if (!userId) {
      return { read: true, write: false, member: false, watcher: false, waiting: false };
    }

    const ownMemberRows: { waiting: boolean }[] = await this.dataSource.query(
      `SELECT waiting FROM "ResourceMembers" WHERE user_id = $1 AND resource_id = $2`,
      [userId, resource.id],
    );
    const member = ownMemberRows.length > 0;
    const waiting = !!ownMemberRows[0]?.waiting;

    const watcherRows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM "ResourceWatchers" WHERE user_id = $1 AND resource_id = $2`,
      [userId, resource.id],
    );
    const watcher = watcherRows.length > 0;

    const circleId = resource.type === 'CIRCLE' ? resource.id : resource.parentId;
    if (!circleId) {
      return { read: true, write: false, member, watcher, waiting };
    }

    const circleRows: { id: string; ownerId: string; personal: boolean }[] = await this.dataSource.query(
      `SELECT id, owner_id AS "ownerId", personal FROM "Resources" WHERE id = $1`,
      [circleId],
    );
    const circle = circleRows[0];
    if (!circle) {
      return { read: true, write: false, member, watcher, waiting };
    }

    if (circle.ownerId === userId) {
      return { read: true, write: true, member, watcher, waiting };
    }

    const userRows: { role: string }[] = await this.dataSource.query(`SELECT role FROM "Users" WHERE id = $1`, [
      userId,
    ]);
    if (userRows[0]?.role === 'admin' && !circle.personal) {
      return { read: true, write: true, member, watcher, waiting };
    }

    const circleMemberRows: { waiting: boolean }[] = await this.dataSource.query(
      `SELECT waiting FROM "ResourceMembers" WHERE user_id = $1 AND resource_id = $2`,
      [userId, circle.id],
    );
    if (circleMemberRows.some((m) => !m.waiting)) {
      return { read: true, write: true, member, watcher, waiting };
    }

    // Owner/membre accepté d'un cercle ancêtre (non personnel) - cf. parentPermissionOnResources.
    let hasParentPermission = false;
    if (!(circle.personal && circle.ownerId !== userId)) {
      const ancestors: { id: string; ownerId: string }[] = await this.dataSource.query(
        `WITH RECURSIVE ancestors AS (
           SELECT r.id, r.parent_id, r.owner_id
           FROM "Resources" r
           WHERE r.id = $1 AND r.type = 'CIRCLE' AND r.personal = false
           UNION ALL
           SELECT p.id, p.parent_id, p.owner_id
           FROM "Resources" p
           JOIN ancestors a ON p.id = a.parent_id
           WHERE p.type = 'CIRCLE' AND p.personal = false
         )
         SELECT id, owner_id AS "ownerId" FROM ancestors WHERE id != $1`,
        [circle.id],
      );
      if (ancestors.length) {
        const ancestorIds = ancestors.map((a) => a.id);
        const ancestorMemberRows: { resourceId: string; waiting: boolean }[] = await this.dataSource.query(
          `SELECT resource_id AS "resourceId", waiting FROM "ResourceMembers" WHERE user_id = $1 AND resource_id = ANY($2)`,
          [userId, ancestorIds],
        );
        hasParentPermission = ancestors.some(
          (a) => a.ownerId === userId || ancestorMemberRows.some((m) => m.resourceId === a.id && !m.waiting),
        );
      }
    }

    return { read: true, write: hasParentPermission, member, watcher, waiting };
  }

  async getCircleTree() {
    // Top-level circles (no parent, not personal)
    const circles: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT id, name, parent_id AS "parentId"
       FROM "Resources"
       WHERE type = 'CIRCLE' AND personal = false
       ORDER BY name ASC`,
    );

    const tree = this.buildTree(circles, null);
    return { resource: tree.length === 1 ? tree[0] : { id: 'root', name: 'Cercles', children: tree } };
  }

  async getCompletion() {
    const names: { name: string }[] = await this.dataSource.query(
      `SELECT DISTINCT name FROM "Resources" WHERE type != 'CIRCLE' ORDER BY name LIMIT 200`,
    );

    return {
      resource: {
        names: names.map((r) => r.name),
        topics: [],
        levels: [],
      },
    };
  }

  async getOwners() {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT DISTINCT u.id, u.username, u.first_name AS "firstName", u.last_name AS "lastName", u.email
       FROM "Users" u
       INNER JOIN "Resources" r ON r.owner_id = u.id
       WHERE r.type != 'CIRCLE'
       ORDER BY u.username ASC
       LIMIT 100`,
    );

    return { resources: rows, total: rows.length };
  }

  async getUserCircle(userId: string) {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT
         r.id, r.name, r.desc, r.type, r.status,
         r.owner_id AS "ownerId",
         r.parent_id AS "parentId",
         r.personal,
         r.created_at AS "createdAt",
         r.updated_at AS "updatedAt"
       FROM "Resources" r
       WHERE r.personal = true AND r.owner_id = $1
       LIMIT 1`,
      [userId],
    );

    if (!rows.length) {
      // Return a minimal circle object so the page doesn't break
      return {
        resource: {
          id: userId,
          name: 'Mon espace',
          type: 'CIRCLE',
          status: 'READY',
          ownerId: userId,
          personal: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          permissions: { read: true, write: true },
        },
      };
    }

    return { resource: this.mapResource(rows[0]) };
  }

  private buildTree(
    circles: Record<string, unknown>[],
    parentId: string | null,
  ): Record<string, unknown>[] {
    return circles
      .filter((c) => (c.parentId ?? null) === parentId)
      .map((c) => ({
        id: c.id,
        name: c.name,
        children: this.buildTree(circles, c.id as string),
      }));
  }

  private mapResource(
    r: Record<string, unknown>,
    permissions: { read: boolean; write: boolean; member: boolean; watcher: boolean; waiting: boolean } = {
      read: true,
      write: false,
      member: false,
      watcher: false,
      waiting: false,
    },
  ) {
    return {
      id: r.id,
      name: r.name,
      desc: r.desc,
      type: r.type,
      status: r.status,
      ownerId: r.ownerId,
      parentId: r.parentId,
      personal: r.personal,
      templateId: r.templateId,
      templateVersion: r.templateVersion,
      publicPreview: r.publicPreview,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      levels: [],
      topics: [],
      permissions,
    };
  }

  private toArray(val?: string | string[]): string[] {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  }

  private orderFieldFor(order?: string): string {
    const map: Record<string, string> = {
      NAME: 'r.name',
      CREATED_AT: 'r.created_at',
      UPDATED_AT: 'r.updated_at',
      RELEVANCE: 'r.updated_at',
    };
    return map[(order ?? '').toUpperCase()] ?? 'r.updated_at';
  }
}
