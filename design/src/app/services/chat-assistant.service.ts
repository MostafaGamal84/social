import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { MediaIncidentFilters } from '../models/media-incident';
import { LookupItem } from '../models/lookup';

export interface ChatAssistantMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatAssistantContext {
  centers: ChatAssistantLookupItem[];
  neighborhoods: ChatAssistantLookupItem[];
  roads: ChatAssistantLookupItem[];
  priorities: ChatAssistantLookupItem[];
  statuses: ChatAssistantLookupItem[];
  subCategories: ChatAssistantLookupItem[];
  pageSizeOptions: number[];
  defaultPageSize?: number;
}

export interface ChatAssistantLookupItem {
  id: number;
  name: string | null;
}

export interface ChatAssistantRequest {
  messages: ChatAssistantMessage[];
  context: ChatAssistantContext;
}

export interface ChatAssistantResponse {
  success: boolean;
  shouldSearch: boolean;
  filters: MediaIncidentFilters | null;
  reply: string | null;
  summary: string | null;
  warnings: string[];
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class ChatAssistantService {
  private readonly endpoint = `${environment.apiBaseUrl}/chat/interpret`;

  constructor(private readonly http: HttpClient) {}

  interpret(request: ChatAssistantRequest): Observable<ChatAssistantResponse> {
    return this.http.post<ChatAssistantResponse>(this.endpoint, request);
  }

  buildContextFromLookups(options: {
    centers: LookupItem[];
    neighborhoods: LookupItem[];
    roads: LookupItem[];
    priorities: LookupItem[];
    statuses: LookupItem[];
    subCategories: LookupItem[];
    pageSizeOptions: number[];
    defaultPageSize: number;
  }): ChatAssistantContext {
    const mapLookup = (item: LookupItem): ChatAssistantLookupItem => ({ id: item.lookupId, name: item.lookupName });

    return {
      centers: options.centers.map(mapLookup),
      neighborhoods: options.neighborhoods.map(mapLookup),
      roads: options.roads.map(mapLookup),
      priorities: options.priorities.map(mapLookup),
      statuses: options.statuses.map(mapLookup),
      subCategories: options.subCategories.map(mapLookup),
      pageSizeOptions: options.pageSizeOptions,
      defaultPageSize: options.defaultPageSize
    };
  }
}
