// Stub: @cisstech/nge/pipes
import { Pipe, PipeTransform, TemplateRef } from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'

@Pipe({ standalone: true, name: 'safe' })
export class SafePipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url)
  }
}

@Pipe({ standalone: true, name: 'istemplate' })
export class IsTemplatePipe implements PipeTransform {
  transform(value: unknown): boolean {
    return value instanceof TemplateRef
  }
}

@Pipe({ standalone: true, name: 'isstring' })
export class IsStringPipe implements PipeTransform {
  transform(value: unknown): boolean {
    return typeof value === 'string'
  }
}
