import { Observable } from 'rxjs'
import { HttpErrorResponse } from '@angular/common/http'
import { HTTP_STATUS_CODE } from '../core-common'

export declare type LayoutState = 'LOADING' | 'READY' | 'NOT_FOUND' | 'SERVER_ERROR' | 'FORBIDDEN'

export function layoutStateFromError(error: unknown): LayoutState {
  const status = (error as HttpErrorResponse)?.status ?? HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR
  if (status === HTTP_STATUS_CODE.UNAUTHORIZED || status === HTTP_STATUS_CODE.FORBIDDEN) return 'FORBIDDEN'
  if (status >= HTTP_STATUS_CODE.BAD_REQUEST && status < HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR) return 'NOT_FOUND'
  return 'SERVER_ERROR'
}

export interface SearchBar<T> {
  placeholder?: string
  value?: string
  clearOnSelect?: boolean
  filterer?: {
    run: (query: string) => Observable<T[]>
  }
  onSearch?: (query?: string) => void
  onSelect?: (item: T) => void
  onFilter?: () => void
  onReady?: () => void
  complete?: (item: T) => string
}
