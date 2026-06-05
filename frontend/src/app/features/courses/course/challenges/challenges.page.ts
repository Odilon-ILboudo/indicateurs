import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  standalone: true,
  selector: 'app-course-challenges',
  template: '<p style="padding:2rem">Onglet challenges - sera disponible une fois le serveur connecté.</p>',
  imports: [CommonModule],
})
export class ChallengesPage {}
