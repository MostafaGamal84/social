import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { LookupItem } from '../models/lookup';

@Injectable({ providedIn: 'root' })
export class LookupService {
  private readonly endpoint = `${environment.apiBaseUrl}/lookup`;

  constructor(private readonly http: HttpClient) {}

  getLookupItems(): Observable<LookupItem[]> {
    return this.http.get<LookupItem[]>(this.endpoint);
  }
}
