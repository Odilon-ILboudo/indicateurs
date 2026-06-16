// Stub: @platon/feature/resource/browser
import {
  CircleTree,
  ResourceFilters,
  ResourceOrderings,
  ResourceStatus,
  ResourceTypes,
} from './resource-common'
import { FilterIndicator } from './shared-ui'
import { Topic, Level, User } from './core-common'

export * from './resource-browser/services'
export * from './resource-browser/pipes'
export { ResourceItemComponent } from './resource-browser/resource-item/resource-item.component'
export { ResourceListComponent } from './resource-browser/resource-list/resource-list.component'
export { CircleTreeComponent } from './resource-browser/circle-tree/circle-tree.component'
export { ResourceFiltersComponent } from './resource-browser/resource-filters/resource-filters.component'

// ---- Status constants ----

export const RESOURCE_STATUS_NAMES: Record<string, string> = {
  READY: 'Prêt',
  BUGGED: 'Buggé',
  DEPRECATED: 'Déprécié',
  NOT_TESTED: 'Non testé',
  DRAFT: 'Brouillon',
}

export const RESOURCE_STATUS_COLORS_HEX: Record<string, string> = {
  READY: '#27ae60',
  BUGGED: '#e74c3c',
  DEPRECATED: '#f39c12',
  NOT_TESTED: '#95a5a6',
  DRAFT: '#7f8c8d',
}

export { ResourceVersionComponent } from './resource-browser/resource-version/resource-version.component'
export { ResourceVersioningComponent } from './resource-browser/resource-versioning/resource-versioning.component'
export { ResourceFilesComponent } from './resource-browser/resource-files/resource-files.component'

export { ResourceEventListComponent } from './resource-browser/event-list/event-list.component'
export { ResourceEventItemComponent } from './resource-browser/event-item/event-item.component'

export { ResourceMemberTableComponent } from './resource-browser/member-table/member-table.component'

export { ResourceInvitationFormComponent } from './resource-browser/invitation-form/invitation-form.component'
export { ResourceInvitationTableComponent } from './resource-browser/invitation-table/invitation-table.component'

export { ResourceSharingComponent } from './resource-browser/resource-sharing/resource-sharing.component'

export { TemplateCardComponent } from './resource-browser/template-card/template-card.component'
export { TemplateSelectionComponent } from './resource-browser/template-selection/template-selection.component'

// ---- Filter indicator helper functions ----

export function ResourceTypeFilterIndicator(type: ResourceTypes): FilterIndicator<ResourceFilters> {
  const labels: Record<string, string> = { CIRCLE: 'Cercle', EXERCISE: 'Exercice', ACTIVITY: 'Activité' }
  return {
    match: (f) => (f.types ?? []).includes(type as keyof typeof ResourceTypes),
    remove: (f) => ({ ...f, types: (f.types ?? []).filter((t) => t !== type) }),
    describe: () => labels[type] ?? type,
  }
}

export function ResourceStatusFilterIndicator(status: ResourceStatus): FilterIndicator<ResourceFilters> {
  const labels: Record<string, string> = { READY: 'Prêt', BUGGED: 'Buggé', DEPRECATED: 'Déprécié', NOT_TESTED: 'Non testé' }
  return {
    match: (f) => (f.status ?? []).includes(status as keyof typeof ResourceStatus),
    remove: (f) => ({ ...f, status: (f.status ?? []).filter((s) => s !== status) }),
    describe: () => labels[status] ?? status,
  }
}

export function ResourceOrderingFilterIndicator(ordering: ResourceOrderings): FilterIndicator<ResourceFilters> {
  const labels: Record<string, string> = { NAME: 'Nom', CREATED_AT: 'Date créé', UPDATED_AT: 'Date modifié', RELEVANCE: 'Pertinence' }
  return {
    match: (f) => f.order === ordering,
    remove: (f) => ({ ...f, order: undefined }),
    describe: () => `Tri : ${labels[ordering] ?? ordering}`,
  }
}

export function ResourceDependOnFilterIndicator(): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.dependOn ?? []).length > 0,
    remove: (f) => ({ ...f, dependOn: undefined }),
    describe: () => 'Dépend de',
  }
}

export function TopicFilterIndicator(topic: Topic): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.topics ?? []).includes(topic.id),
    remove: (f) => ({ ...f, topics: (f.topics ?? []).filter((id) => id !== topic.id) }),
    describe: () => topic.name,
  }
}

export function AntiTopicFilterIndicator(topic: Topic): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.antiTopics ?? []).includes(topic.id),
    remove: (f) => ({ ...f, antiTopics: (f.antiTopics ?? []).filter((id) => id !== topic.id) }),
    describe: () => `Exclure : ${topic.name}`,
  }
}

export function LevelFilterIndicator(level: Level): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.levels ?? []).includes(level.id),
    remove: (f) => ({ ...f, levels: (f.levels ?? []).filter((id) => id !== level.id) }),
    describe: () => level.name,
  }
}

export function OwnerFilterIndicator(owner: User): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.owners ?? []).includes(owner.id),
    remove: (f) => ({ ...f, owners: (f.owners ?? []).filter((id) => id !== owner.id) }),
    describe: () => owner.username,
  }
}

export function CircleFilterIndicator(circle: CircleTree): FilterIndicator<ResourceFilters> {
  return {
    match: (f) => (f.parents ?? []).includes(circle.id),
    remove: (f) => ({ ...f, parents: (f.parents ?? []).filter((id) => id !== circle.id) }),
    describe: () => circle.name,
  }
}

export const ExerciseConfigurableFilterIndicator: FilterIndicator<ResourceFilters> = {
  match: (f) => f.configurable === true,
  remove: (f) => ({ ...f, configurable: undefined }),
  describe: () => 'Configurable',
}

export function antTagColorFromPercentage(_value: number): string {
  return 'blue'
}
