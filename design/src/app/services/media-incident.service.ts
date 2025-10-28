import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { MediaIncident, MediaIncidentFilters, PaginatedResponse } from '../models/media-incident';

@Injectable({ providedIn: 'root' })
export class MediaIncidentService {
  private readonly endpoint = `${environment.apiBaseUrl}/media/incidents`;

  constructor(private http: HttpClient) {}

  getIncidents(filters: MediaIncidentFilters): Observable<PaginatedResponse<MediaIncident>> {
    let params = new HttpParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.http.get<PaginatedResponse<MediaIncident>>(this.endpoint, { params });
  }
}
