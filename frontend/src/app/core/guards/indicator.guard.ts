import { Injectable, inject } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { IndicatorService } from '../services/indicator.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class IndicatorGuard implements CanActivate {
  private readonly indicatorService = inject(IndicatorService);
  private readonly router = inject(Router);

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean> {
    const indicatorId = route.paramMap.get('id');

    console.log('IndicatorGuard - indicatorId:', indicatorId); 
    
    if (!indicatorId) {
      return true;
    }
    
    try {
      const indicators = await firstValueFrom(this.indicatorService.loadIndicators());
      const indicatorExists = indicators.some(i => i.id === indicatorId);
      
      if (!indicatorExists) {
        this.router.navigate(['/dashboard/overview']);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to check indicator:', error);
      return true;
    }
  }
}