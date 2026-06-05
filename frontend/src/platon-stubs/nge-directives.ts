// Stub: @cisstech/nge/directives
import { Directive, EventEmitter, OnDestroy, OnInit, Output, ElementRef } from '@angular/core'

@Directive({
  standalone: true,
  selector: '[viewportIntersection]',
})
export class ViewportIntersectionDirective implements OnInit, OnDestroy {
  @Output() intersected = new EventEmitter<void>()

  private observer?: IntersectionObserver

  constructor(private el: ElementRef) {}

  ngOnInit(): void {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this.intersected.emit()
        }
      })
    })
    this.observer.observe(this.el.nativeElement)
  }

  ngOnDestroy(): void {
    this.observer?.disconnect()
  }
}
