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
  DRAFT = 'DRAFT',
}

export enum ResourceOrderings {
  NAME = 'NAME',
  CREATED_AT = 'CREATED_AT',
  UPDATED_AT = 'UPDATED_AT',
  RELEVANCE = 'RELEVANCE',
}

export type ResourceExpandableFields = 'metadata' | 'statistic' | 'parent' | 'permissions'

export interface ResourcePermissions {
  readonly read?: boolean
  readonly write?: boolean
  readonly delete?: boolean
  readonly watcher?: boolean
  readonly member?: boolean
  readonly waiting?: boolean
}

export interface ResourceStatistic {
  readonly score?: number
  readonly views?: number
  readonly watchers?: number
  readonly members?: number
  readonly activity?: {
    readonly attemptCount: number
    readonly averageScore: number
  }
  readonly exercise?: {
    readonly attemptCount?: number
    readonly averageScore?: number
    readonly references?: {
      readonly total: number
      readonly activity?: number
      readonly template?: number
      readonly referencesAttemptCount?: number
    }
  }
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

export interface PleInput {
  readonly name: string
  readonly type: string
  readonly description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly value: any
  readonly options?: Record<string, unknown>
}

export interface ExerciseResourceMeta {
  readonly configurable?: boolean
  readonly certifiedTemplate?: boolean
  readonly config?: { inputs: PleInput[] }
  readonly versions?: FileVersion[]
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
  readonly publicPreview?: boolean
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
  readonly certifiedTemplate?: boolean
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
  readonly permissions?: ResourcePermissions
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
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly waiting?: boolean
  readonly userId: string
  readonly resourceId: string
}

export interface ResourceMemberFilters {
  readonly status?: string
  readonly search?: string
  readonly waiting?: boolean
}

export interface MemberPermissions {
  readonly read: boolean
  readonly write: boolean
}

export interface CreateResourceInvitation {
  readonly inviteeId: string
  readonly permissions: MemberPermissions
}

export interface ResourceInvitation {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly inviterId: string
  readonly inviteeId: string
  readonly resourceId: string
  readonly permissions: MemberPermissions
}

export interface ResourceFile {
  readonly path: string
  readonly type: 'file' | 'folder'
  readonly children?: ResourceFile[]
  readonly resourceCode?: string
  readonly version?: string
  readonly url?: string
  readonly downloadUrl?: string
}

export interface FileVersion {
  readonly tag: string
  readonly message: string
  readonly hash: string
  readonly createdAt?: Date
  readonly tagger: {
    readonly name: string
    readonly email: string
  }
}

export interface FileVersions {
  current?: string
  versions?: string[]
  all: FileVersion[]
}

export const LATEST = 'latest'

export interface GitLogResult {
  readonly oid: string
  readonly commit: {
    message: string
    tree: string
    parent: string[]
    author: {
      name: string
      email: string
      timestamp: number
      timezoneOffset: number
    }
    committer: {
      name: string
      email: string
      timestamp: number
      timezoneOffset: number
    }
  }
  readonly payload?: string
  readonly tags: string[]
}

export enum ResourceEventTypes {
  MEMBER_CREATE = 'MEMBER_CREATE',
  MEMBER_REMOVE = 'MEMBER_REMOVE',
  RESOURCE_CREATE = 'RESOURCE_CREATE',
  RESOURCE_STATUS_CHANGE = 'RESOURCE_STATUS_CHANGE',
}

export type ResourceEventData = {
  resourceId: string
  resourceName: string
  resourceType: ResourceTypes
  parentName: string
}

export interface ResourceEvent<TData extends ResourceEventData = ResourceEventData> {
  readonly id: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly type: ResourceEventTypes
  readonly actorId: string
  readonly resourceId: string
  readonly data: TData
}

export interface ResourceMemberCreateEventData extends ResourceEventData {
  userId: string
  expired?: boolean
}

export interface ResourceMemberCreateEvent extends ResourceEvent<ResourceMemberCreateEventData> {
  readonly type: ResourceEventTypes.MEMBER_CREATE
}

export type ResourceMemberRemoveEventData = ResourceEventData

export interface ResourceMemberRemoveEvent extends ResourceEvent<ResourceMemberRemoveEventData> {
  readonly type: ResourceEventTypes.MEMBER_REMOVE
}

export type ResourceCreateEventData = ResourceEventData

export interface ResourceCreateEvent extends ResourceEvent<ResourceCreateEventData> {
  readonly type: ResourceEventTypes.RESOURCE_CREATE
}

export interface ResourceStatusChangeEventData extends ResourceEventData {
  newStatus: string
}

export interface ResourceStatusChangeEvent extends ResourceEvent<ResourceStatusChangeEventData> {
  readonly type: ResourceEventTypes.RESOURCE_STATUS_CHANGE
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
  readonly publicPreview?: boolean
  readonly expands?: ResourceExpandableFields[]
}

export interface CreateResource {
  readonly name: string
  readonly parentId: string
  readonly templateId?: string
  readonly templateVersion?: string
  readonly code?: string
  readonly desc?: string
  readonly type: ResourceTypes
  readonly status?: ResourceStatus
  readonly levels?: string[]
  readonly topics?: string[]
}
