// Stub: @platon/feature/resource/common
import { ExpandableModel, OrderingDirections } from './core-common'

export enum ResourceTypes {
  CIRCLE = 'CIRCLE',
  EXERCISE = 'EXERCISE',
  ACTIVITY = 'ACTIVITY',
}

export enum ResourceStatus {
  READY = 'READY',
  BUGGED = 'BUGGED',
  DEPRECATED = 'DEPRECATED',
  NOT_TESTED = 'NOT_TESTED',
}

export enum ResourceOrderings {
  NAME = 'NAME',
  CREATED_AT = 'CREATED_AT',
  UPDATED_AT = 'UPDATED_AT',
  RELEVANCE = 'RELEVANCE',
}

export type ResourceExpandableFields = 'metadata' | 'statistic' | 'parent'

export interface ResourcePermissions {
  readonly read?: boolean
  readonly write?: boolean
  readonly delete?: boolean
  readonly watcher?: boolean
  readonly member?: boolean
  readonly waiting?: boolean
}

export interface ResourceStatistic {
  readonly exercise?: {
    readonly references?: { total: number }
  }
  readonly views?: number
  readonly watchers?: number
  readonly members?: number
  readonly circle?: {
    readonly ready?: number
    readonly bugged?: number
    readonly deprecated?: number
    readonly not_tested?: number
    readonly exercises?: number
    readonly activities?: number
    readonly circles?: number
  }
}

export interface ExerciseResourceMeta {
  readonly configurable?: boolean
  readonly certifiedTemplate?: boolean
}

export type ResourceMeta = ExerciseResourceMeta & Record<string, unknown>

export interface Resource {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly name: string
  readonly desc?: string
  readonly type: ResourceTypes
  readonly status: ResourceStatus
  readonly ownerId: string
  readonly parentId?: string
  readonly personal: boolean
  readonly templateId?: string
  readonly templateVersion?: string
  readonly permissions?: ResourcePermissions
  readonly statistic?: ResourceStatistic
  readonly metadata?: ResourceMeta
  readonly parent?: Resource
  readonly colorHue?: number
  readonly levels: { id: string; name: string }[]
  readonly topics: { id: string; name: string }[]
}

export interface ResourceFilters extends ExpandableModel<ResourceExpandableFields> {
  readonly search?: string
  readonly types?: (keyof typeof ResourceTypes)[]
  readonly status?: (keyof typeof ResourceStatus)[]
  readonly parents?: string[]
  readonly topics?: string[]
  readonly antiTopics?: string[]
  readonly levels?: string[]
  readonly dependOn?: string[]
  readonly configurable?: boolean
  readonly owners?: string[]
  readonly views?: boolean
  readonly period?: number
  readonly offset?: number
  readonly limit?: number
  readonly order?: ResourceOrderings
  readonly direction?: OrderingDirections
  readonly usedBy?: string[]
}

export interface CircleTree {
  readonly id: string
  readonly name: string
  readonly children?: CircleTree[]
}

export function flattenCircleTree(tree: CircleTree): CircleTree[] {
  const result: CircleTree[] = [tree]
  if (tree.children) {
    for (const child of tree.children) {
      result.push(...flattenCircleTree(child))
    }
  }
  return result
}

export interface ResourceMember {
  readonly id: string
  readonly userId: string
  readonly resourceId: string
  readonly role: string
  readonly status: string
}

export interface ResourceMemberFilters {
  readonly status?: string
  readonly search?: string
  readonly waiting?: boolean
}

export interface CreateResourceInvitation {
  readonly userId: string
  readonly role: string
}

export interface ResourceInvitation {
  readonly id: string
  readonly resourceId: string
  readonly userId: string
  readonly inviteeId: string
  readonly role: string
  readonly createdAt: Date
}

export interface ResourceFile {
  readonly path: string
  readonly type: 'file' | 'dir'
  readonly children?: ResourceFile[]
}

export interface FileVersion {
  readonly tag: string
  readonly message: string
  readonly hash: string
  readonly createdAt?: Date
}

export interface FileVersions {
  current?: string
  versions?: string[]
  all: FileVersion[]
}

export const LATEST = 'latest'

export interface GitLogResult {
  readonly hash: string
  readonly message: string
  readonly author: string
  readonly date: Date
}

export interface ResourceEvent {
  readonly id: string
  readonly resourceId: string
  readonly type: string
  readonly createdAt: Date
  readonly data?: Record<string, unknown>
}

export interface ResourceEventFilters {
  readonly type?: string
  readonly offset?: number
  readonly limit?: number
}

export interface UpdateResource {
  readonly name?: string
  readonly desc?: string
  readonly status?: ResourceStatus
  readonly expands?: ResourceExpandableFields[]
}
