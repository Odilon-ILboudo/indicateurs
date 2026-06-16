// Ported from platon/libs/feature/resource/browser/src/lib/pipes
import { NgModule, Pipe, PipeTransform } from '@angular/core'
import { ExerciseResourceMeta, ResourceMeta, ResourceOrderings, ResourceStatus, ResourceTypes } from '../resource-common'

export const RESOURCE_ICONS: Record<keyof typeof ResourceTypes, string> = {
  CIRCLE: 'group_work',
  EXERCISE: 'article',
  ACTIVITY: 'widgets',
}

@Pipe({ standalone: true, name: 'resourceIcon' })
export class ResourceIconPipe implements PipeTransform {
  transform(type: keyof typeof ResourceTypes): string {
    return RESOURCE_ICONS[type]
  }
}

export const RESOURCE_TYPE_COLORS: Record<keyof typeof ResourceTypes, string> = {
  CIRCLE: '#d89614',
  EXERCISE: '#108ee9',
  ACTIVITY: '#f50',
}

@Pipe({ standalone: true, name: 'resourceColor' })
export class ResourceColorPipe implements PipeTransform {
  transform(type: keyof typeof ResourceTypes): string {
    return RESOURCE_TYPE_COLORS[type]
  }
}

export const RESOURCE_TYPE_NAMES: Record<keyof typeof ResourceTypes, string> = {
  CIRCLE: 'Cercle',
  EXERCISE: 'Exercice',
  ACTIVITY: 'Activité',
}

const RESOURCE_TYPE_NAME_PRONOUNS: Record<keyof typeof ResourceTypes, string> = {
  CIRCLE: 'Un cercle',
  EXERCISE: 'un exercice',
  ACTIVITY: 'Une activité',
}

@Pipe({ standalone: true, name: 'resourceType' })
export class ResourceTypePipe implements PipeTransform {
  transform(type: keyof typeof ResourceTypes, pronoun?: boolean): string {
    return pronoun ? RESOURCE_TYPE_NAME_PRONOUNS[type] : RESOURCE_TYPE_NAMES[type]
  }
}

export const RESOURCE_STATUS_NAMES: Record<keyof typeof ResourceStatus, string> = {
  READY: "Prêt à l'utilisation",
  BUGGED: 'Contient des bugs',
  NOT_TESTED: "Besoin d'être testé",
  DEPRECATED: 'Ne pas utiliser',
  DRAFT: 'Brouillon',
}

@Pipe({ standalone: true, name: 'resourceStatus' })
export class ResourceStatusPipe implements PipeTransform {
  transform(status: keyof typeof ResourceStatus): string {
    return RESOURCE_STATUS_NAMES[status]
  }
}

export const RESOURCE_STATUS_COLORS: Record<keyof typeof ResourceStatus, string> = {
  READY: 'green',
  BUGGED: 'magenta',
  NOT_TESTED: 'gold',
  DEPRECATED: 'red',
  DRAFT: 'blue',
}

export const RESOURCE_STATUS_COLORS_HEX: Record<keyof typeof ResourceStatus, string> = {
  READY: '#52c41a',
  BUGGED: '#eb2f96',
  NOT_TESTED: '#faad14',
  DEPRECATED: '#f5222d',
  DRAFT: '#1890ff',
}

@Pipe({ standalone: true, name: 'resourceStatusColor' })
export class ResourceStatusColorPipe implements PipeTransform {
  transform(status: keyof typeof ResourceStatus): string {
    return RESOURCE_STATUS_COLORS[status]
  }
}

export const RESOURCE_STATUS_ICONS: Record<keyof typeof ResourceStatus, string> = {
  READY: 'check_circle',
  BUGGED: 'bug_report',
  NOT_TESTED: 'help_outline',
  DEPRECATED: 'block',
  DRAFT: 'edit',
}

@Pipe({ standalone: true, name: 'resourceStatusIcon' })
export class ResourceStatusIconPipe implements PipeTransform {
  transform(status: keyof typeof ResourceStatus): string {
    return RESOURCE_STATUS_ICONS[status]
  }
}

export const RESOURCE_ORDERING_NAMES: Record<ResourceOrderings, string> = {
  NAME: 'Nom',
  CREATED_AT: 'Date de création',
  UPDATED_AT: 'Date de mise à jour',
  RELEVANCE: 'Pertinence',
}

@Pipe({ standalone: true, name: 'resourceOrdering' })
export class ResourceOrderingPipe implements PipeTransform {
  transform(status: ResourceOrderings | string): string {
    return RESOURCE_ORDERING_NAMES[status as ResourceOrderings]
  }
}

@Pipe({ standalone: true, name: 'exerciseResourceMeta', pure: true })
export class ExerciseResourceMetaPipe implements PipeTransform {
  transform(value: ResourceMeta): ExerciseResourceMeta {
    return value as ExerciseResourceMeta
  }
}

export const RESOURCE_EVENT_TYPE_NAMES: Record<string, string> = {
  MEMBER_CREATE: 'Nouveau membre',
  MEMBER_REMOVE: 'Membre supprimé',
  RESOURCE_CREATE: 'Nouvelle ressource',
  RESOURCE_STATUS_CHANGE: 'Nouveau status',
}

@Pipe({ standalone: true, name: 'resourceEventType' })
export class ResourceEventTypePipe implements PipeTransform {
  transform(type: string): string {
    return RESOURCE_EVENT_TYPE_NAMES[type] ?? type
  }
}

@NgModule({
  imports: [
    ResourceIconPipe,
    ResourceColorPipe,
    ResourceTypePipe,
    ResourceStatusPipe,
    ResourceStatusColorPipe,
    ResourceStatusIconPipe,
    ResourceOrderingPipe,
    ExerciseResourceMetaPipe,
    ResourceEventTypePipe,
  ],
  exports: [
    ResourceIconPipe,
    ResourceColorPipe,
    ResourceTypePipe,
    ResourceStatusPipe,
    ResourceStatusColorPipe,
    ResourceStatusIconPipe,
    ResourceOrderingPipe,
    ExerciseResourceMetaPipe,
    ResourceEventTypePipe,
  ],
})
export class ResourcePipesModule {}
