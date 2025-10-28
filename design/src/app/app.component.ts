import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

import { MediaIncident, MediaIncidentFilters, PaginatedResponse } from './models/media-incident';
import { LookupItem } from './models/lookup';
import { LookupService } from './services/lookup.service';
import { MediaIncidentService } from './services/media-incident.service';
import { LoadingService } from './services/loading.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  form: FormGroup;
  incidents: MediaIncident[] = [];
  pagination: PaginatedResponse<MediaIncident>['pagination'] | null = null;
  readonly loading$ = this.loadingService.loading$;
  readonly pageSizeOptions = [10, 25, 50];
  readonly mediaMonitoringMainCategoryId = 34;
  readonly lookupTypes = {
    center: 'Center',
    neighborhood: 'Neighborhood',
    road: 'Road',
    priority: 'PrioretyLevel',
    status: 'IncidentsStatusType',
    mainCategory: 'MainCategory',
    subCategory: 'SubCategory'
  } as const;

  centers: LookupItem[] = [];
  neighborhoods: LookupItem[] = [];
  roads: LookupItem[] = [];
  priorities: LookupItem[] = [];
  statuses: LookupItem[] = [];
  mainCategories: LookupItem[] = [];
  subCategories: LookupItem[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly lookupService: LookupService,
    private readonly incidentsService: MediaIncidentService,
    private readonly loadingService: LoadingService
  ) {
    this.form = this.fb.group({
      search: [''],
      centerId: [null],
      neighborhoodId: [null],
      roadId: [null],
      subCategoryId: [null],
      statusId: [null],
      priorityId: [null],
      pageSize: [this.pageSizeOptions[0]]
    });
  }

  ngOnInit(): void {
    this.loadLookupItems();
    this.loadIncidents();
  }

  applyFilters(): void {
    this.loadIncidents(1);
  }

  clearFilters(): void {
    this.form.patchValue({
      search: '',
      centerId: null,
      neighborhoodId: null,
      roadId: null,
      subCategoryId: null,
      statusId: null,
      priorityId: null,
      pageSize: this.pageSizeOptions[0]
    });
    this.loadIncidents(1);
  }

  changePage(page: number): void {
    if (!this.pagination) {
      return;
    }

    if (page < 1 || page > this.pagination.totalPages) {
      return;
    }

    this.loadIncidents(page);
  }

  private buildFilters(pageNumber = 1): MediaIncidentFilters {
    const {
      search,
      centerId,
      neighborhoodId,
      roadId,
      subCategoryId,
      statusId,
      priorityId,
      pageSize
    } = this.form.value;

    return {
      search: search?.trim() || undefined,
      centerId: this.toNullableNumber(centerId),
      neighborhoodId: this.toNullableNumber(neighborhoodId),
      roadId: this.toNullableNumber(roadId),
      subCategoryId: this.toNullableNumber(subCategoryId),
      statusId: this.toNullableNumber(statusId),
      priorityId: this.toNullableNumber(priorityId),
      pageNumber,
      pageSize: Number(pageSize) || this.pageSizeOptions[0]
    };
  }

  private loadIncidents(pageNumber = 1): void {
    const filters = this.buildFilters(pageNumber);

    this.incidentsService.getIncidents(filters).subscribe({
      next: response => {
        this.incidents = response.data;
        this.pagination = response.pagination;
      },
      error: () => {
        this.incidents = [];
        this.pagination = null;
      }
    });
  }

  private loadLookupItems(): void {
    this.lookupService.getLookupItems().subscribe({
      next: items => {
        this.centers = this.filterByType(items, this.lookupTypes.center);
        this.neighborhoods = this.filterByType(items, this.lookupTypes.neighborhood);
        this.roads = this.filterByType(items, this.lookupTypes.road);
        this.priorities = this.filterByType(items, this.lookupTypes.priority);
        this.statuses = this.filterByType(items, this.lookupTypes.status);
        this.mainCategories = this.filterByType(items, this.lookupTypes.mainCategory);
        this.subCategories = this.filterByType(items, this.lookupTypes.subCategory)
          .filter(item => item.parentId === this.mediaMonitoringMainCategoryId);
      },
      error: () => {
        this.centers = [];
        this.neighborhoods = [];
        this.roads = [];
        this.priorities = [];
        this.statuses = [];
        this.mainCategories = [];
        this.subCategories = [];
      }
    });
  }

  private filterByType(items: LookupItem[], type: string): LookupItem[] {
    return items
      .filter(item => item.lookupType === type)
      .sort((a, b) => (a.lookupName ?? '').localeCompare(b.lookupName ?? '', undefined, { sensitivity: 'base' }));
  }

  trackByLookup(_: number, item: LookupItem): number {
    return item.lookupId;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  trackByIncident(_: number, incident: MediaIncident): number {
    return incident.incidentId;
  }

  getPriorityStyle(color: string | null | undefined) {
    return color ? { '--priority-color': color } : null;
  }
}
