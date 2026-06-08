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

  async findResourceById(id: string) {
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
    return { resource: this.mapResource(rows[0]) };
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

  private mapResource(r: Record<string, unknown>) {
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
      permissions: { read: true, write: false, member: false, watcher: false, waiting: false },
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
