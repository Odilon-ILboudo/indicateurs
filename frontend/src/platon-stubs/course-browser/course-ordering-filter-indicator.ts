import { CourseFilters, COURSE_ORDERING_DIRECTIONS, CourseOrderings } from '../course-common'
import { FilterIndicator } from '../shared-ui'

export function CourseOrderingFilterIndicator(ordering: CourseOrderings): FilterIndicator<CourseFilters> {
  return {
    match: (filters) => filters.order === ordering,
    remove: (filters) => ({ ...filters, order: undefined, direction: undefined }),
    describe: (filters) => {
      const value = `${ordering}-${filters.direction ?? COURSE_ORDERING_DIRECTIONS[ordering]}`
      return ({
        'NAME-ASC':         'Trier par Nom de A à Z',
        'NAME-DESC':        'Trier par Nom de Z à A',
        'CREATED_AT-DESC':  'Trier par Création : Récent-Ancient',
        'CREATED_AT-ASC':   'Trier par Création : Ancient-Récent',
        'UPDATED_AT-DESC':  'Trier par MàJ : Récente-Ancienne',
        'UPDATED_AT-ASC':   'Trier par MàJ : Ancienne-Récente',
      } as Record<string, string>)[value] ?? `Trier par ${ordering}`
    },
  }
}
