import { Pipe, PipeTransform } from '@angular/core'

@Pipe({ standalone: true, name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(value: number): string {
    if (!value) return '0 min'
    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}min`
    return `${minutes} min`
  }
}
