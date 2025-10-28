import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MediaIncident, MediaIncidentFilters, PaginatedResponse } from '../models/media-incident';
import { LookupItem } from '../models/lookup';
import { MediaIncidentService } from '../services/media-incident.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  variant?: 'default' | 'status' | 'error';
}

export interface ChatSearchResult {
  filters: MediaIncidentFilters;
  incidents: MediaIncident[];
  pagination: PaginatedResponse<MediaIncident>['pagination'] | null;
}

interface ParseResult {
  success: boolean;
  filters: MediaIncidentFilters;
  description: string;
  warnings: string[];
}

@Component({
  selector: 'app-chat-assistant',
  templateUrl: './chat-assistant.component.html',
  styleUrls: ['./chat-assistant.component.css']
})
export class ChatAssistantComponent {
  @Input() centers: LookupItem[] = [];
  @Input() neighborhoods: LookupItem[] = [];
  @Input() roads: LookupItem[] = [];
  @Input() priorities: LookupItem[] = [];
  @Input() statuses: LookupItem[] = [];
  @Input() subCategories: LookupItem[] = [];
  @Input() pageSizeOptions: number[] = [];
  @Input() defaultPageSize = 10;

  @Output() searchCompleted = new EventEmitter<ChatSearchResult>();

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  isOpen = false;
  isProcessing = false;
  userInput = '';
  messages: ChatMessage[] = [
    {
      role: 'assistant',
      text: 'مرحباً! أنا مساعد الاستعلامات. اكتب معايير البحث مثل "بلدية: بريدة؛ الحالة: مغلق؛ حجم الصفحة: 25" أو اذكر نصاً للبحث العام.',
      timestamp: new Date(),
      variant: 'status'
    }
  ];

  private readonly fieldSynonyms: Record<keyof MediaIncidentFilters | 'pageSize', string[]> = {
    search: ['بحث', 'نص البحث', 'كلمة', 'query', 'search'],
    centerId: ['بلدية', 'البلدية', 'center'],
    neighborhoodId: ['حي', 'الحي', 'neighborhood'],
    roadId: ['طريق', 'الطريق', 'road'],
    subCategoryId: ['تصنيف فرعي', 'التصنيف الفرعي', 'تصنيف', 'sub category', 'subcategory'],
    statusId: ['حالة', 'الحالة', 'status'],
    priorityId: ['خطورة', 'الخطورة', 'درجة الخطورة', 'priority'],
    pageNumber: [],
    pageSize: ['حجم الصفحة', 'الحجم', 'page size', 'limit']
  };

  private readonly allKeywords = new Set(['all', 'الكل', 'كل', 'جميع', 'بدون']);

  constructor(private readonly incidentsService: MediaIncidentService) {}

  toggleChat(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.scrollToBottom();
    }
  }

  sendMessage(): void {
    const text = this.userInput.trim();
    if (!text || this.isProcessing) {
      return;
    }

    this.addMessage({ role: 'user', text, timestamp: new Date() });
    this.userInput = '';
    this.processUserMessage(text);
  }

  onTextareaKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private processUserMessage(text: string): void {
    const parseResult = this.parseFilters(text);

    if (!parseResult.success) {
      this.addMessage({
        role: 'assistant',
        text:
          'لم أتمكن من فهم الطلب. يرجى تحديد المعايير بصيغة "الحقل: القيمة" مثل "الحالة: مغلق؛ بلدية: بريدة" أو إرسال نص للبحث.',
        timestamp: new Date(),
        variant: 'error'
      });
      return;
    }

    if (parseResult.description) {
      this.addMessage({
        role: 'assistant',
        text: parseResult.description,
        timestamp: new Date(),
        variant: 'status'
      });
    }

    if (parseResult.warnings.length) {
      this.addMessage({
        role: 'assistant',
        text: `ملاحظة: ${parseResult.warnings.join('، ')}`,
        timestamp: new Date(),
        variant: 'error'
      });
    }

    this.isProcessing = true;
    this.incidentsService.getIncidents(parseResult.filters).subscribe({
      next: response => {
        const pagination = response.pagination ?? null;
        const summary = this.buildResultSummary(pagination?.totalCount ?? response.data.length, response.data.length);
        this.addMessage({ role: 'assistant', text: summary, timestamp: new Date() });
        this.searchCompleted.emit({
          filters: parseResult.filters,
          incidents: response.data,
          pagination
        });
        this.isProcessing = false;
      },
      error: () => {
        this.addMessage({
          role: 'assistant',
          text: 'تعذر جلب البيانات حالياً، يرجى المحاولة لاحقاً.',
          timestamp: new Date(),
          variant: 'error'
        });
        this.isProcessing = false;
      }
    });
  }

  private parseFilters(rawText: string): ParseResult {
    const filters: MediaIncidentFilters = { pageNumber: 1 };
    const warnings: string[] = [];
    let matched = false;
    const sanitizedText = rawText.replace(/[؛]/g, ';');

    const searchValue = this.extractValue(sanitizedText, this.fieldSynonyms.search);
    if (searchValue) {
      filters.search = searchValue;
      matched = true;
    }

    const centerValue = this.extractValue(sanitizedText, this.fieldSynonyms.centerId);
    if (centerValue) {
      const resolved = this.resolveLookup(centerValue, this.centers);
      if (resolved === undefined) {
        warnings.push(`تعذر التعرف على البلدية "${centerValue}"`);
      } else if (resolved !== null) {
        filters.centerId = resolved;
      }
      matched = true;
    }

    const neighborhoodValue = this.extractValue(sanitizedText, this.fieldSynonyms.neighborhoodId);
    if (neighborhoodValue) {
      const resolved = this.resolveLookup(neighborhoodValue, this.neighborhoods);
      if (resolved === undefined) {
        warnings.push(`تعذر التعرف على الحي "${neighborhoodValue}"`);
      } else if (resolved !== null) {
        filters.neighborhoodId = resolved;
      }
      matched = true;
    }

    const roadValue = this.extractValue(sanitizedText, this.fieldSynonyms.roadId);
    if (roadValue) {
      const resolved = this.resolveLookup(roadValue, this.roads);
      if (resolved === undefined) {
        warnings.push(`تعذر التعرف على الطريق "${roadValue}"`);
      } else if (resolved !== null) {
        filters.roadId = resolved;
      }
      matched = true;
    }

    const subCategoryValue = this.extractValue(sanitizedText, this.fieldSynonyms.subCategoryId);
    if (subCategoryValue) {
      const resolved = this.resolveLookup(subCategoryValue, this.subCategories);
      if (resolved === undefined) {
        warnings.push(`تعذر التعرف على التصنيف الفرعي "${subCategoryValue}"`);
      } else if (resolved !== null) {
        filters.subCategoryId = resolved;
      }
      matched = true;
    }

    const statusValue = this.extractValue(sanitizedText, this.fieldSynonyms.statusId);
    if (statusValue) {
      const resolved = this.resolveLookup(statusValue, this.statuses);
      if (resolved === undefined) {
        warnings.push(`تعذر التعرف على الحالة "${statusValue}"`);
      } else if (resolved !== null) {
        filters.statusId = resolved;
      }
      matched = true;
    }

    const priorityValue = this.extractValue(sanitizedText, this.fieldSynonyms.priorityId);
    if (priorityValue) {
      const resolved = this.resolveLookup(priorityValue, this.priorities);
      if (resolved === undefined) {
        warnings.push(`تعذر التعرف على درجة الخطورة "${priorityValue}"`);
      } else if (resolved !== null) {
        filters.priorityId = resolved;
      }
      matched = true;
    }

    const pageSizeValue = this.extractValue(sanitizedText, this.fieldSynonyms.pageSize);
    if (pageSizeValue) {
      const parsed = this.parseNumber(pageSizeValue);
      if (parsed) {
        filters.pageSize = parsed;
        if (this.pageSizeOptions.length && !this.pageSizeOptions.includes(parsed)) {
          warnings.push(`تم استخدام حجم الصفحة ${parsed} خارج الخيارات المتاحة (${this.pageSizeOptions.join(', ')})`);
        }
      } else {
        warnings.push(`تعذر قراءة حجم الصفحة من القيمة "${pageSizeValue}"`);
      }
      matched = true;
    }

    if (!filters.pageSize) {
      filters.pageSize = this.defaultPageSize || this.pageSizeOptions[0] || 10;
    }

    const trimmed = rawText.trim();
    if (!matched && trimmed) {
      filters.search = trimmed;
      matched = true;
    }

    return {
      success: matched,
      filters,
      description: this.describeFilters(filters),
      warnings
    };
  }

  private extractValue(text: string, keywords: string[]): string | null {
    for (const keyword of keywords) {
      const escaped = keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s*');
      const regex = new RegExp(`${escaped}\s*(?:[:=]|هو|هي)\s*["']?([^"'\n;,،]+)["']?`, 'i');
      const match = regex.exec(text);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  private resolveLookup(value: string, items: LookupItem[]): number | null | undefined {
    const normalized = this.normalize(value);
    if (!normalized) {
      return undefined;
    }

    if (this.allKeywords.has(normalized)) {
      return null;
    }

    const numericCandidate = Number(this.convertDigits(value));
    if (!Number.isNaN(numericCandidate)) {
      const match = items.find(item => item.lookupId === numericCandidate);
      if (match) {
        return match.lookupId;
      }
    }

    const byName = items.find(item => this.normalize(item.lookupName ?? '') === normalized);
    if (byName) {
      return byName.lookupId;
    }

    const partial = items.find(item => this.normalize(item.lookupName ?? '').includes(normalized));
    if (partial) {
      return partial.lookupId;
    }

    return undefined;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[\u064B-\u0652]/g, '')
      .replace(/[^\w\u0600-\u06FF\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private convertDigits(value: string): string {
    return value.replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660));
  }

  private parseNumber(value: string): number | null {
    const cleaned = this.convertDigits(value).replace(/[^0-9]/g, '');
    if (!cleaned) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private describeFilters(filters: MediaIncidentFilters): string {
    const parts: string[] = [];

    if (filters.search) {
      parts.push(`نص البحث: "${filters.search}"`);
    }

    if (filters.centerId !== undefined) {
      const name = this.getLookupName(filters.centerId, this.centers);
      parts.push(`البلدية: ${name}`);
    }

    if (filters.neighborhoodId !== undefined) {
      const name = this.getLookupName(filters.neighborhoodId, this.neighborhoods);
      parts.push(`الحي: ${name}`);
    }

    if (filters.roadId !== undefined) {
      const name = this.getLookupName(filters.roadId, this.roads);
      parts.push(`الطريق: ${name}`);
    }

    if (filters.subCategoryId !== undefined) {
      const name = this.getLookupName(filters.subCategoryId, this.subCategories);
      parts.push(`التصنيف الفرعي: ${name}`);
    }

    if (filters.statusId !== undefined) {
      const name = this.getLookupName(filters.statusId, this.statuses);
      parts.push(`الحالة: ${name}`);
    }

    if (filters.priorityId !== undefined) {
      const name = this.getLookupName(filters.priorityId, this.priorities);
      parts.push(`درجة الخطورة: ${name}`);
    }

    if (filters.pageSize) {
      parts.push(`حجم الصفحة: ${filters.pageSize}`);
    }

    if (!parts.length) {
      return '';
    }

    return `سأنفذ الاستعلام بالمعايير التالية: ${parts.join('، ')}.`;
  }

  private getLookupName(value: number | null | undefined, items: LookupItem[]): string {
    if (value === null || value === undefined) {
      return 'الكل';
    }

    const match = items.find(item => item.lookupId === value);
    return match?.lookupName ?? `#${value}`;
  }

  private buildResultSummary(totalCount: number, pageCount: number): string {
    if (totalCount === 0) {
      return 'لم يتم العثور على أي بلاغات مطابقة للمعايير المحددة.';
    }

    return `تم العثور على ${totalCount} بلاغ، ويتم عرض ${pageCount} بلاغ في هذه الصفحة.`;
  }

  private addMessage(message: ChatMessage): void {
    this.messages = [...this.messages, message];
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        const element = this.messagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}
