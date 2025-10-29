import { Component, HostListener, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

import { MediaIncident, MediaIncidentFilters, PaginatedResponse, QuickRange } from './models/media-incident';
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

type TrendPoint = {
  label: string;
  value: number;
  normalized: number;
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
  selectedIncident: MediaIncident | null = null;
  readonly loading$ = this.loadingService.loading$;
  readonly pageSizeOptions = [10, 25, 50];
  readonly mediaMonitoringMainCategoryId = 34;
  authorityLogoUrl = '../assets/images/authority-logo.png';
  irtaqaLogoUrl = '../assets/images/ertiqaa-logo.png';
  isFiltersOpen = false;
  readonly quickRanges: ReadonlyArray<{ label: string; value: QuickRange }> = [
    { label: 'آخر ٧ أيام', value: 'week' },
    { label: 'آخر ٣٠ يوماً', value: 'month' },
    { label: 'آخر ٩٠ يوماً', value: 'quarter' },
    { label: 'منذ البداية', value: 'lifetime' }
  ];
  private readonly defaultQuickRange: QuickRange = this.quickRanges[1].value;
  readonly lookupTypes = {
    center: 'Center',
    neighborhood: 'Neighborhood',
    road: 'Road',
    priority: 'PrioretyLevel',
    status: 'IncidentsStatusType',
    mainCategory: 'MainCategory',
    subCategory: 'SubCategory'
  } as const;
  activeQuickRange: QuickRange | null = this.defaultQuickRange;
  private readonly palette = [
    '#5F6468',
    '#C1A071',
    '#E6D2A3',
    '#F6CF86',
    '#B7AD9B',
    '#D8C29A',
    '#EBD9B7'
  ];
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
    return this.toDistributionView(
      this.getDistribution(
        incident => incident.statusName,
        incident => incident.statusColor
      )
    );
  }

  get priorityBreakdown(): DistributionView[] {
    return this.toDistributionView(
      this.getDistribution(incident => incident.priorityName, incident => incident.priorityColor)
    );
  }

  get monthlyTrend(): TrendPoint[] {
    return this.buildMonthlyTrend();
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
    this.activeQuickRange = this.defaultQuickRange;
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

  setQuickRange(range: QuickRange): void {
    if (this.activeQuickRange === range) {
      return;
    }

    this.activeQuickRange = range;
    this.loadIncidents(1);
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

  getTrendHeight(point: TrendPoint): number {
    if (!point.value) {
      return 0;
    }

    return Math.max(point.normalized, 12);
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

    const filters: MediaIncidentFilters = {
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

    const { startDate, endDate } = this.getQuickRangeDates();

    if (startDate) {
      filters.startDate = startDate;
    }

    if (endDate) {
      filters.endDate = endDate;
    }

    return filters;
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

  private getQuickRangeDates(range: QuickRange | null = this.activeQuickRange): {
    startDate?: string;
    endDate?: string;
  } {
    if (!range || range === 'lifetime') {
      return {};
    }

    const endDate = new Date();
    const startDate = new Date();

    switch (range) {
      case 'week':
        startDate.setDate(startDate.getDate() - 6);
        break;
      case 'month':
        startDate.setDate(startDate.getDate() - 29);
        break;
      case 'quarter':
        startDate.setDate(startDate.getDate() - 89);
        break;
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    };
  }

  private resolveActiveQuickRange(filters: MediaIncidentFilters): QuickRange | null {
    if (filters.quickRange) {
      return filters.quickRange;
    }

    if (filters.startDate || filters.endDate) {
      return this.matchQuickRangeFromDates(filters.startDate, filters.endDate);
    }

    return this.activeQuickRange;
  }

  private matchQuickRangeFromDates(startDate?: string | null, endDate?: string | null): QuickRange | null {
    if (!startDate || !endDate) {
      return null;
    }

    const parsedStart = new Date(startDate);
    const parsedEnd = new Date(endDate);

    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
      return null;
    }

    const toleranceMs = 1000;

    for (const range of this.quickRanges) {
      if (range.value === 'lifetime') {
        continue;
      }

      const expected = this.getQuickRangeDates(range.value);
      if (!expected.startDate || !expected.endDate) {
        continue;
      }

      const expectedStart = new Date(expected.startDate);
      const expectedEnd = new Date(expected.endDate);

      if (
        Math.abs(expectedStart.getTime() - parsedStart.getTime()) <= toleranceMs &&
        Math.abs(expectedEnd.getTime() - parsedEnd.getTime()) <= toleranceMs
      ) {
        return range.value;
      }
    }

    return null;
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

  isAlertPriority(name: string | null | undefined): boolean {
    if (!name) {
      return false;
    }

    const normalized = name.trim();
    return normalized === 'خطر' || normalized === 'حرج';
  }

  getStatusStyle(color: string | null | undefined) {
    return color ? { '--status-color': color } : null;
  }

  openIncidentDetails(incident: MediaIncident): void {
    this.selectedIncident = incident;
  }

  closeIncidentDetails(): void {
    this.selectedIncident = null;
  }

  onIncidentKeydown(event: KeyboardEvent, incident: MediaIncident): void {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.openIncidentDetails(incident);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscape(event: KeyboardEvent): void {
    if (!this.selectedIncident) {
      return;
    }

    event.preventDefault();
    this.closeIncidentDetails();
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

    this.activeQuickRange = this.resolveActiveQuickRange(filters);
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

  private buildMonthlyTrend(limit = 6): TrendPoint[] {
    if (!this.incidents.length) {
      return [];
    }

    const monthly = new Map<string, { count: number; monthStart: Date }>();

    for (const incident of this.incidents) {
      if (!incident.createdAt) {
        continue;
      }

      const createdAt = new Date(incident.createdAt);

      if (Number.isNaN(createdAt.getTime())) {
        continue;
      }

      const monthStart = new Date(createdAt.getFullYear(), createdAt.getMonth(), 1);
      const key = monthStart.toISOString();
      const existing = monthly.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        monthly.set(key, { count: 1, monthStart });
      }
    }

    const sorted = Array.from(monthly.values()).sort(
      (a, b) => a.monthStart.getTime() - b.monthStart.getTime()
    );

    if (!sorted.length) {
      return [];
    }

    const limited = limit > 0 ? sorted.slice(-limit) : sorted;
    const formatter = new Intl.DateTimeFormat('ar', { month: 'short', year: '2-digit' });
    const points = limited.map(item => ({
      label: formatter.format(item.monthStart),
      value: item.count,
      normalized: 0
    }));
    const max = points.reduce((currentMax, point) => Math.max(currentMax, point.value), 0);

    if (!max) {
      return points;
    }

    return points.map(point => ({
      ...point,
      normalized: Math.round((point.value / max) * 100)
    }));
  }

  private normalizeLabel(value: string | null | undefined): string {
    const trimmed = (value ?? '').trim();
    return trimmed || 'غير محدد';
  }

  private getResolvedIncidentsCount(): number {
    return this.incidents.filter(incident => {
      const arabicStatus = incident.statusName?.toLowerCase() ?? '';
      const englishStatus = incident.statusEnglishName?.toLowerCase() ?? '';

      const matchesArabic = Boolean(arabicStatus) && this.resolvedKeywords.some(keyword => arabicStatus.includes(keyword));
      const matchesEnglish = Boolean(englishStatus) && this.resolvedKeywords.some(keyword => englishStatus.includes(keyword));

      return matchesArabic || matchesEnglish;
    }).length;
  }
}
