import { HttpParams } from '@angular/common/http'
import { environment } from '../../environments/environment'

export const API = `${environment.apiUrl}/v1`

export function buildParams(filters: Record<string, unknown>): HttpParams {
  let params = new HttpParams()
  for (const [key, val] of Object.entries(filters)) {
    if (val == null || val === '' || key === 'expands') continue
    if (Array.isArray(val)) {
      for (const v of val) params = params.append(key, String(v))
    } else {
      params = params.set(key, String(val))
    }
  }
  return params
}
