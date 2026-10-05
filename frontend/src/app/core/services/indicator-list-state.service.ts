import { Injectable } from '@angular/core';
import { IndicatorScope } from '../models/indicator.model';

/* Mémorise l'état des filtres/onglet des listes pendant la session, pour que "Retour à la liste" les restaure. */
@Injectable({ providedIn: 'root' })
export class IndicatorListStateService {
  admin = {
    groupingFilter: 'standalone' as 'families' | 'standalone',
    completenessFilter: 'all' as 'all' | 'complete' | 'incomplete',
    searchText: '',
    contextTypeFilterValue: 'all' as IndicatorScope | 'all',
  };

  selector = {
    scope: 'all' as 'all' | IndicatorScope,
    sortBy: 'popular' as 'popular' | 'unpopular' | 'name',
    grouping: 'standalone' as 'standalone' | 'families',
    searchKeyword: '',
  };
}
