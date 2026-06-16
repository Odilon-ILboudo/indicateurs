// Stub: @cisstech/nge/markdown
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgModule, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'

// Minimal markdown -> HTML conversion, enough to render a readme preview.
function renderMarkdown(markdown: string): string {
  const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const lines = escapeHtml(markdown).split('\n')
  const html: string[] = []
  let inList = false

  const inline = (text: string) =>
    text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const listItem = /^\s*[-*]\s+(.*)$/.exec(line)

    if (heading) {
      if (inList) {
        html.push('</ul>')
        inList = false
      }
      const level = heading[1].length
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
    } else if (listItem) {
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${inline(listItem[1])}</li>`)
    } else {
      if (inList) {
        html.push('</ul>')
        inList = false
      }
      if (line.trim()) {
        html.push(`<p>${inline(line)}</p>`)
      }
    }
  }

  if (inList) {
    html.push('</ul>')
  }

  return html.join('')
}

@Component({
  standalone: true,
  selector: 'nge-markdown, [nge-markdown]',
  template: `<div [innerHTML]="html"></div>`,
  styles: [':host { display: block; transition: opacity 0.3s ease-in-out; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class NgeMarkdownComponent {
  private readonly sanitizer = inject(DomSanitizer)
  private readonly http = inject(HttpClient)
  private readonly changeDetectorRef = inject(ChangeDetectorRef)

  protected html: SafeHtml = ''

  @Input() set data(value: string | undefined) {
    this.html = this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(value ?? ''))
  }

  @Input() set file(value: string | undefined) {
    if (!value) {
      return
    }
    this.http.get(value, { responseType: 'text' }).subscribe((content) => {
      this.html = this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(content))
      this.changeDetectorRef.markForCheck()
    })
  }
}

@NgModule({
  imports: [NgeMarkdownComponent],
  exports: [NgeMarkdownComponent],
})
export class NgeMarkdownModule {}
