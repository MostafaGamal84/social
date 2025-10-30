import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface ReportSectionPayload {
  title: string;
  body?: string;
  bulletPoints?: string[];
}

export interface ReportGenerationPayload {
  prompt?: string;
  templateName?: string;
  reportTitle?: string;
  summary?: string;
  sections?: ReportSectionPayload[];
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly endpoint = `${environment.apiBaseUrl}/report/generate`;

  constructor(private readonly http: HttpClient) {}

  generate(payload: ReportGenerationPayload): Observable<Blob> {
    return this.http.post(this.endpoint, payload, { responseType: 'blob' });
  }
}
