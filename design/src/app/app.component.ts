import { DOCUMENT } from '@angular/common';
import { Component, HostListener, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

import { MediaIncident, MediaIncidentFilters, PaginatedResponse, QuickRange } from './models/media-incident';
import { LookupItem } from './models/lookup';
import { LookupService } from './services/lookup.service';
import { MediaIncidentService } from './services/media-incident.service';
import { LoadingService } from './services/loading.service';
import { ReportGenerationPayload, ReportService } from './services/report.service';
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

type InteractiveChartKey = 'subCategory' | 'priority';

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
  readonly pageSizeOptions = [1000];
  readonly mediaMonitoringMainCategoryId = 34;
  authorityLogoUrl = '../assets/images/authority-logo.png';
  irtaqaLogoUrl = '../assets/images/ertiqaa-logo.png';
  isFiltersOpen = false;
  isDarkMode = false;
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
  private readonly themeStorageKey = 'app-theme-preference';
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

  activeSegments: Record<InteractiveChartKey, string | null> = {
    subCategory: null,
    priority: null
  };

  isReportGenerating = false;
  reportGenerationError: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly lookupService: LookupService,
    private readonly incidentsService: MediaIncidentService,
    private readonly loadingService: LoadingService,
    private readonly reportService: ReportService,
    @Inject(DOCUMENT) private readonly document: Document
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
    this.initializeTheme();
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

  get currentPageSize(): number {
    const value = this.form.get('pageSize')?.value ?? this.pageSizeOptions[0];
    return typeof value === 'number' ? value : Number(value) || this.pageSizeOptions[0];
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

  generateIncidentReport(): void {
    if (this.isReportGenerating) {
      return;
    }

    const prompt = this.buildReportPromptFromDashboard();
    if (!prompt) {
      this.reportGenerationError = 'لا توجد بيانات كافية لإنشاء التقرير حالياً.';
      return;
    }

    this.reportGenerationError = null;
    this.isReportGenerating = true;

    const payload: ReportGenerationPayload = {
      prompt,
      reportTitle: 'تقرير الرصد الإعلامي',
      summary: this.buildReportSummaryLine()
    };

    this.reportService.generate(payload).subscribe({
      next: blob => {
        this.isReportGenerating = false;
        this.triggerReportDownload(blob, payload.reportTitle ?? 'media-report');
      },
      error: () => {
        this.isReportGenerating = false;
        this.reportGenerationError = 'تعذر إنشاء التقرير، يرجى المحاولة لاحقاً.';
      }
    });
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

  toggleTheme(): void {
    this.setDarkMode(!this.isDarkMode);
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

  buildConicGradient(entries: DistributionView[], chartKey?: InteractiveChartKey): string {
    if (!entries.length) {
      return 'conic-gradient(#d1d5db 0deg 360deg)';
    }

    const activeLabel = chartKey ? this.getActiveLabel(entries, chartKey) : null;
    let startAngle = 0;
    const segments = entries.map(entry => {
      const color = activeLabel && entry.label !== activeLabel ? this.getMutedColor(entry.color) : entry.color;
      const sweep = (entry.percentage / 100) * 360;
      const endAngle = startAngle + sweep;
      const segment = `${color} ${startAngle}deg ${endAngle}deg`;
      startAngle = endAngle;
      return segment;
    });

    return `conic-gradient(${segments.join(', ')})`;
  }

  setActiveSegment(chart: InteractiveChartKey, label: string | null): void {
    if (this.activeSegments[chart] === label) {
      return;
    }

    this.activeSegments = {
      ...this.activeSegments,
      [chart]: label
    };
  }

  isActiveSegment(entry: DistributionView, entries: DistributionView[], chart: InteractiveChartKey): boolean {
    return this.getActiveLabel(entries, chart) === entry.label;
  }

  getActiveSegment(entries: DistributionView[], chart: InteractiveChartKey): DistributionView | null {
    const label = this.getActiveLabel(entries, chart);
    return label ? entries.find(entry => entry.label === label) ?? null : null;
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

  getErtiqaaIncidentUrl(incident: MediaIncident): string {
    return `http://144.76.146.61:9883/incident/details/${incident.incidentId}`;
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

  private initializeTheme(): void {
    if (this.canUseBrowserStorage) {
      const storedPreference = window.localStorage.getItem(this.themeStorageKey);

      if (storedPreference === 'dark' || storedPreference === 'light') {
        this.setDarkMode(storedPreference === 'dark', false);
        return;
      }
    }

    this.setDarkMode(this.prefersDarkMode, false);
  }

  private setDarkMode(enabled: boolean, persist = true): void {
    this.isDarkMode = enabled;

    if (this.document?.body) {
      this.document.body.classList.toggle('dark-theme', enabled);
    }

    if (persist && this.canUseBrowserStorage) {
      window.localStorage.setItem(this.themeStorageKey, enabled ? 'dark' : 'light');
    }
  }

  private get canUseBrowserStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  private get prefersDarkMode(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
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

  private getActiveLabel(entries: DistributionView[], chart: InteractiveChartKey): string | null {
    if (!entries.length) {
      return null;
    }

    const activeLabel = this.activeSegments[chart];

    if (activeLabel && entries.some(entry => entry.label === activeLabel)) {
      return activeLabel;
    }

    return entries[0]?.label ?? null;
  }

  private getMutedColor(color: string): string {
    const normalized = color?.trim();

    if (!normalized) {
      return '#d1d5db';
    }

    const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

    if (!hexMatch) {
      return normalized;
    }

    let hex = hexMatch[1];

    if (hex.length === 3) {
      hex = hex
        .split('')
        .map(char => char + char)
        .join('');
    }

    const num = Number.parseInt(hex, 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    const amount = 0.6;

    const lighten = (channel: number) => Math.round(channel + (255 - channel) * amount);

    const [lr, lg, lb] = [lighten(r), lighten(g), lighten(b)];

    const toHex = (channel: number) => channel.toString(16).padStart(2, '0');

    return `#${toHex(lr)}${toHex(lg)}${toHex(lb)}`;
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

  private buildReportPromptFromDashboard(): string | null {
    const filters = this.buildFilters(this.pagination?.currentPage ?? 1);
    const filterDescriptions = this.describeCurrentFilters(filters);
    const incidentsSummary = this.buildIncidentsSample();

    if (!filterDescriptions.length && incidentsSummary.length === 0) {
      return null;
    }

    const lines: string[] = [
      'أعد عرضاً تقديمياً احترافياً باللغة العربية يلخص حالة الرصد الإعلامي الحالية.',
      'استخدم القالب المقدم واستبدل الحقول بالنصوص المناسبة.',
      `إجمالي البلاغات المعروضة حالياً: ${this.incidents.length}.`,
      `إجمالي البلاغات في النظام: ${this.pagination?.totalCount ?? this.incidents.length}.`,
      `معدل الإنجاز الحالي: ${this.resolvedRate}%`,
      '',
      'تفاصيل عوامل التصفية:'
    ];

    if (filterDescriptions.length) {
      lines.push(...filterDescriptions.map(item => `- ${item}`));
    } else {
      lines.push('- لا توجد عوامل تصفية خاصة، أعط نظرة عامة شاملة.');
    }

    if (incidentsSummary.length) {
      lines.push('', 'عينات من البلاغات الأخيرة:');
      lines.push(...incidentsSummary.map(item => `- ${item}`));
    }

    lines.push('', 'قسم العرض إلى أقسام مرقمة تتضمن أبرز المؤشرات والتوصيات العملية.');

    return lines.join('\n');
  }

  private buildReportSummaryLine(): string {
    const total = this.pagination?.totalCount ?? this.incidents.length;
    const resolved = this.getResolvedIncidentsCount();
    if (total === 0) {
      return 'لا توجد بلاغات متاحة حالياً ضمن عوامل التصفية المحددة.';
    }

    const resolvedRate = Math.round((resolved / total) * 100);
    return `يتناول التقرير ${total} بلاغاً مع نسبة إنجاز تبلغ ${resolvedRate}% (عدد البلاغات المنجزة: ${resolved}).`;
  }

  private describeCurrentFilters(filters: MediaIncidentFilters): string[] {
    const descriptions: string[] = [];

    if (filters.search) {
      descriptions.push(`كلمة البحث: ${filters.search}`);
    }

    const centerName = this.findLookupName(this.centers, filters.centerId);
    if (centerName) {
      descriptions.push(`البلدية: ${centerName}`);
    }

    const neighborhoodName = this.findLookupName(this.neighborhoods, filters.neighborhoodId);
    if (neighborhoodName) {
      descriptions.push(`الحي: ${neighborhoodName}`);
    }

    const roadName = this.findLookupName(this.roads, filters.roadId);
    if (roadName) {
      descriptions.push(`الطريق: ${roadName}`);
    }

    const subCategoryName = this.findLookupName(this.subCategories, filters.subCategoryId);
    if (subCategoryName) {
      descriptions.push(`التصنيف الفرعي: ${subCategoryName}`);
    }

    const statusName = this.findLookupName(this.statuses, filters.statusId);
    if (statusName) {
      descriptions.push(`الحالة: ${statusName}`);
    }

    const priorityName = this.findLookupName(this.priorities, filters.priorityId);
    if (priorityName) {
      descriptions.push(`درجة الخطورة: ${priorityName}`);
    }

    if (filters.startDate || filters.endDate) {
      const start = filters.startDate ? new Date(filters.startDate).toLocaleDateString('ar-EG') : 'غير محدد';
      const end = filters.endDate ? new Date(filters.endDate).toLocaleDateString('ar-EG') : 'غير محدد';
      descriptions.push(`النطاق الزمني: من ${start} إلى ${end}`);
    }

    return descriptions;
  }

  private buildIncidentsSample(): string[] {
    if (!this.incidents.length) {
      return [];
    }

    return this.incidents.slice(0, Math.min(this.incidents.length, 6)).map((incident, index) => {
      const createdAt = new Date(incident.createdAt).toLocaleDateString('ar-EG');
      const status = incident.statusName ?? 'غير محدد';
      const category = incident.subCategoryName ?? 'غير مصنف';
      const center = incident.centerName ?? 'غير محدد';
      return `${index + 1}. ${category} - الحالة: ${status} - البلدية: ${center} - التاريخ: ${createdAt}`;
    });
  }

  private findLookupName(items: LookupItem[], id?: number | null): string | null {
    if (id == null) {
      return null;
    }

    const match = items.find(item => item.lookupId === id);
    return match?.lookupName ?? null;
  }

  private triggerReportDownload(blob: Blob, baseFileName: string): void {
    const fileName = `${baseFileName.replace(/\s+/g, '-').toLowerCase()}.pptx`;
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }
}
