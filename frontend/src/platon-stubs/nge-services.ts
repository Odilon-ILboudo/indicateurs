// Stub: @cisstech/nge/services
import { Injectable } from '@angular/core'

export interface PickerBrowserOptions {
  readonly accept?: string
  readonly multiple?: boolean
}

@Injectable({ providedIn: 'root' })
export class ClipboardService {
  copy(data: string): Promise<void> {
    return navigator.clipboard.writeText(data)
  }

  read(): Promise<string> {
    return navigator.clipboard.readText()
  }
}

@Injectable({ providedIn: 'root' })
export class PickerBrowserService {
  pickFiles(options: PickerBrowserOptions = {}): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.style.display = 'none'
      input.multiple = options.multiple ?? true
      if (options.accept) {
        input.accept = options.accept
      }
      input.addEventListener('change', () => {
        resolve(input.files ? Array.from(input.files) : [])
        input.remove()
      })
      document.body.appendChild(input)
      input.click()
    })
  }
}
