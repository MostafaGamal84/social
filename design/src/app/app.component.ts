import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

import { MediaIncident, MediaIncidentFilters, PaginatedResponse } from './models/media-incident';
import { LookupItem } from './models/lookup';
import { LookupService } from './services/lookup.service';
import { MediaIncidentService } from './services/media-incident.service';
import { LoadingService } from './services/loading.service';
import { ChatSearchResult } from './chat-assistant/chat-assistant.component';

type DistributionSegment = {
  label: string;
  value: number;
  color: string;
};

type DistributionView = DistributionSegment & {
  percentage: number;
};

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
  authorityLogoUrl = '../assets/images/authority-logo.png';
  irtaqaLogoUrl = '../assets/images/ertiqaa-logo.png';
  isFiltersOpen = false;
  readonly quickRanges = [
    { label: 'آخر ٧ أيام', value: 'week' },
    { label: 'آخر ٣٠ يوماً', value: 'month' },
    { label: 'آخر ٩٠ يوماً', value: 'quarter' },
    { label: 'منذ البداية', value: 'lifetime' }
  ] as const;
  readonly lookupTypes = {
    center: 'Center',
    neighborhood: 'Neighborhood',
    road: 'Road',
    priority: 'PrioretyLevel',
    status: 'IncidentsStatusType',
    mainCategory: 'MainCategory',
    subCategory: 'SubCategory'
  } as const;
  activeQuickRange: (typeof this.quickRanges)[number]['value'] = this.quickRanges[1].value;
  private readonly palette = ['#176C55', '#D8A233', '#B87224', '#3D856C', '#7EA063', '#5F7D4B', '#C49B3A'];
  private readonly resolvedKeywords = ['مغلق', 'منجز', 'مكتمل', 'تم', 'مقفلة', 'مغلقة', 'closed', 'resolved', 'complete', 'finished'].map(
    keyword => keyword.toLowerCase()
  );

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

  get totalIncidents(): number {
    return this.pagination?.totalCount ?? this.incidents.length;
  }

  get resolvedRate(): number {
    const total = this.incidents.length;

    if (!total) {
      return 0;
    }

    return Math.round((this.getResolvedIncidentsCount() / total) * 100);
  }

  get subCategoryBreakdown(): DistributionView[] {
    return this.toDistributionView(this.getDistribution(incident => incident.subCategoryName).slice(0, 5));
  }

  get centerBreakdown(): DistributionView[] {
    return this.toDistributionView(this.getDistribution(incident => incident.centerName).slice(0, 4));
  }

  get statusBreakdown(): DistributionView[] {
    return this.toDistributionView(this.getDistribution(incident => incident.statusName));
  }

  applyFilters(): void {
    this.loadIncidents(1);
    this.closeFilters();
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
    this.closeFilters();
  }

  toggleFilters(): void {
    this.isFiltersOpen = !this.isFiltersOpen;
  }

  openFilters(): void {
    this.isFiltersOpen = true;
  }

  closeFilters(): void {
    this.isFiltersOpen = false;
  }

  filterSubByMain(mainId: number | null): LookupItem[] {
    if (!mainId) {
      return this.subCategories;
    }

    return this.subCategories.filter(item => item.parentId === mainId);
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

  setQuickRange(range: (typeof this.quickRanges)[number]['value']): void {
    this.activeQuickRange = range;
  }

  buildConicGradient(entries: DistributionView[]): string {
    if (!entries.length) {
      return 'conic-gradient(#d1d5db 0deg 360deg)';
    }

    let startAngle = 0;
    const segments = entries.map(entry => {
      const sweep = (entry.percentage / 100) * 360;
      const endAngle = startAngle + sweep;
      const segment = `${entry.color} ${startAngle}deg ${endAngle}deg`;
      startAngle = endAngle;
      return segment;
    });

    return `conic-gradient(${segments.join(', ')})`;
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

  onChatSearchCompleted(result: ChatSearchResult): void {
    const { filters, incidents, pagination } = result;

    this.form.patchValue({
      search: filters.search ?? '',
      centerId: filters.centerId ?? null,
      neighborhoodId: filters.neighborhoodId ?? null,
      roadId: filters.roadId ?? null,
      subCategoryId: filters.subCategoryId ?? null,
      statusId: filters.statusId ?? null,
      priorityId: filters.priorityId ?? null,
      pageSize: filters.pageSize ?? this.pageSizeOptions[0]
    });

    this.incidents = incidents;
    this.pagination = pagination ?? null;
  }

  private getDistribution(
    getKey: (incident: MediaIncident) => string | null | undefined,
    getColor?: (incident: MediaIncident) => string | null | undefined
  ): DistributionSegment[] {
    if (!this.incidents.length) {
      return [];
    }

    const distribution = new Map<string, { count: number; color?: string }>();

    for (const incident of this.incidents) {
      const label = this.normalizeLabel(getKey(incident));
      const color = getColor?.(incident) ?? undefined;
      const existing = distribution.get(label);

      if (existing) {
        existing.count += 1;
        if (!existing.color && color) {
          existing.color = color;
        }
      } else {
        distribution.set(label, { count: 1, color });
      }
    }

    const entries = Array.from(distribution.entries())
      .map(([label, { count, color }], index) => ({
        label,
        value: count,
        color: color || this.palette[index % this.palette.length]
      }))
      .sort((a, b) => b.value - a.value);

    return entries;
  }

  private toDistributionView(entries: DistributionSegment[]): DistributionView[] {
    if (!entries.length) {
      return [];
    }

    const total = entries.reduce((sum, entry) => sum + entry.value, 0);

    if (!total) {
      return entries.map(entry => ({ ...entry, percentage: 0 }));
    }

    return entries.map(entry => ({
      ...entry,
      percentage: Math.round((entry.value / total) * 100)
    }));
  }

  private normalizeLabel(value: string | null | undefined): string {
    const trimmed = (value ?? '').trim();
    return trimmed || 'غير محدد';
  }

  private getResolvedIncidentsCount(): number {
    return this.incidents.filter(incident => {
      const status = incident.statusName?.toLowerCase() ?? '';
      return Boolean(status) && this.resolvedKeywords.some(keyword => status.includes(keyword));
    }).length;
  }
}
