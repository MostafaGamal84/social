import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MediaIncident, MediaIncidentFilters, PaginatedResponse } from '../models/media-incident';
import { LookupItem } from '../models/lookup';
import { ChatAssistantMessage, ChatAssistantRequest, ChatAssistantResponse, ChatAssistantService } from '../services/chat-assistant.service';
import { MediaIncidentService } from '../services/media-incident.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  variant?: 'default' | 'status' | 'error';
  includeInConversation?: boolean;
}

export interface ChatSearchResult {
  filters: MediaIncidentFilters;
  incidents: MediaIncident[];
  pagination: PaginatedResponse<MediaIncident>['pagination'] | null;
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
  awaitingConfirmation = false;
  private pendingSearchFilters: MediaIncidentFilters | null = null;
  messages: ChatMessage[] = [
    {
      role: 'assistant',
      text: 'مرحباً! أنا مساعد الاستعلامات. أخبرني بما تبحث عنه وسأحاول تجهيز الاستعلام المناسب لك.',
      timestamp: new Date(),
      variant: 'status'
    }
  ];

  constructor(
    private readonly incidentsService: MediaIncidentService,
    private readonly chatAssistantService: ChatAssistantService
  ) {}

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

    const userMessage: ChatMessage = {
      role: 'user',
      text,
      timestamp: new Date(),
      includeInConversation: !this.awaitingConfirmation
    };
    this.addMessage(userMessage);
    this.userInput = '';

    if (this.awaitingConfirmation) {
      this.handleConfirmationResponse(text);
      return;
    }

    this.processUserMessage();
  }

  onTextareaKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private processUserMessage(): void {
    this.isProcessing = true;
    const request = this.buildAssistantRequest();

    this.chatAssistantService.interpret(request).subscribe({
      next: response => this.handleAssistantResponse(response),
      error: () => {
        this.addMessage({
          role: 'assistant',
          text: 'تعذر التواصل مع مساعد الذكاء الاصطناعي حالياً، يرجى المحاولة لاحقاً.',
          timestamp: new Date(),
          variant: 'error'
        });
        this.awaitingConfirmation = false;
        this.pendingSearchFilters = null;
        this.isProcessing = false;
      }
    });
  }

  private buildAssistantRequest(): ChatAssistantRequest {
    const messages: ChatAssistantMessage[] = this.messages
      .filter(message =>
        message.includeInConversation !== false &&
        (message.role === 'user' || (message.role === 'assistant' && (!message.variant || message.variant === 'default')))
      )
      .map(message => ({ role: message.role, text: message.text }));

    return {
      messages,
      context: this.chatAssistantService.buildContextFromLookups({
        centers: this.centers,
        neighborhoods: this.neighborhoods,
        roads: this.roads,
        priorities: this.priorities,
        statuses: this.statuses,
        subCategories: this.subCategories,
        pageSizeOptions: this.pageSizeOptions,
        defaultPageSize: this.defaultPageSize || this.pageSizeOptions[0] || 10
      })
    };
  }

  private handleAssistantResponse(response: ChatAssistantResponse): void {
    if (response.reply) {
      this.addMessage({ role: 'assistant', text: response.reply, timestamp: new Date(), variant: 'default' });
    }

    if (response.summary) {
      this.addMessage({ role: 'assistant', text: response.summary, timestamp: new Date(), variant: 'status' });
    }

    if (response.warnings?.length) {
      this.addMessage({
        role: 'assistant',
        text: `ملاحظة: ${response.warnings.join('، ')}`,
        timestamp: new Date(),
        variant: 'error'
      });
    }

    if (response.errors?.length) {
      this.addMessage({
        role: 'assistant',
        text: `خطأ: ${response.errors.join('، ')}`,
        timestamp: new Date(),
        variant: 'error'
      });
    }

    if (response.shouldSearch && response.filters) {
      const filters: MediaIncidentFilters = {
        ...response.filters,
        pageNumber: response.filters.pageNumber ?? 1,
        pageSize:
          response.filters.pageSize ?? (this.defaultPageSize || this.pageSizeOptions[0] || 10)
      };
      this.pendingSearchFilters = filters;
      this.awaitingConfirmation = true;
      this.isProcessing = false;
      this.addMessage({
        role: 'assistant',
        text: 'هل ترغب بتنفيذ هذا الاستعلام؟ اكتب "نعم" للتأكيد أو "لا" للتعديل.',
        timestamp: new Date(),
        variant: 'status',
        includeInConversation: false
      });
    } else {
      this.awaitingConfirmation = false;
      this.pendingSearchFilters = null;
      this.isProcessing = false;
    }
  }

  private handleConfirmationResponse(text: string): void {
    const normalized = text.trim().toLowerCase();
    const affirmativeKeywords = ['نعم', 'ايوا', 'ايوه', 'yes', 'y', 'تمام', 'صح', 'اكيد'];
    const negativeKeywords = ['لا', 'مو', 'كلا', 'no', 'غلط'];

    const isAffirmative = affirmativeKeywords.some(keyword => normalized === keyword || normalized.startsWith(`${keyword} `));
    const isNegative = negativeKeywords.some(keyword => normalized === keyword || normalized.startsWith(`${keyword} `));

    if (!this.pendingSearchFilters) {
      this.awaitingConfirmation = false;
      this.addMessage({
        role: 'assistant',
        text: 'لا يوجد استعلام قيد الانتظار حالياً. يمكنك طلب بحث جديد متى شئت.',
        timestamp: new Date(),
        variant: 'status',
        includeInConversation: false
      });
      return;
    }

    if (isAffirmative) {
      const filters = this.pendingSearchFilters;
      this.awaitingConfirmation = false;
      this.pendingSearchFilters = null;
      this.addMessage({
        role: 'assistant',
        text: 'حسناً، سأقوم بتنفيذ الاستعلام المطلوب الآن.',
        timestamp: new Date(),
        variant: 'status',
        includeInConversation: false
      });
      this.isProcessing = true;
      this.executeSearch(filters);
      return;
    }

    if (isNegative) {
      this.awaitingConfirmation = false;
      this.pendingSearchFilters = null;
      this.addMessage({
        role: 'assistant',
        text: 'تم إلغاء تنفيذ الاستعلام. أخبرني بأي تعديلات أو طلب جديد ترغب به.',
        timestamp: new Date(),
        variant: 'status',
        includeInConversation: false
      });
      return;
    }

    this.addMessage({
      role: 'assistant',
      text: 'يرجى الرد بكلمة "نعم" لتأكيد الاستعلام أو "لا" لإلغائه.',
      timestamp: new Date(),
      variant: 'status',
      includeInConversation: false
    });
  }

  private executeSearch(filters: MediaIncidentFilters): void {
    this.incidentsService.getIncidents(filters).subscribe({
      next: response => {
        const pagination = response.pagination ?? null;
        const summary = this.buildResultSummary(pagination?.totalCount ?? response.data.length, response.data.length);
        this.addMessage({ role: 'assistant', text: summary, timestamp: new Date() });
        this.searchCompleted.emit({
          filters,
          incidents: response.data,
          pagination
        });
        this.awaitingConfirmation = false;
        this.pendingSearchFilters = null;
        this.isProcessing = false;
      },
      error: () => {
        this.addMessage({
          role: 'assistant',
          text: 'تعذر جلب البيانات حالياً، يرجى المحاولة لاحقاً.',
          timestamp: new Date(),
          variant: 'error'
        });
        this.awaitingConfirmation = false;
        this.pendingSearchFilters = null;
        this.isProcessing = false;
      }
    });
  }

  private buildResultSummary(totalCount: number, pageCount: number): string {
    if (totalCount === 0) {
      return 'لم يتم العثور على أي بلاغات مطابقة للمعايير المحددة.';
    }

    return `تم العثور على ${totalCount} بلاغ، ويتم عرض ${pageCount} بلاغ في هذه الصفحة.`;
  }

  private addMessage(message: ChatMessage): void {
    this.messages = [
      ...this.messages,
      { ...message, includeInConversation: message.includeInConversation ?? true }
    ];
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
