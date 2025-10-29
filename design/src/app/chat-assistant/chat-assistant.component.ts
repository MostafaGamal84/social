import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { MediaIncident, MediaIncidentFilters, PaginatedResponse } from '../models/media-incident';
import { LookupItem } from '../models/lookup';
import { ChatAssistantMessage, ChatAssistantRequest, ChatAssistantResponse, ChatAssistantService } from '../services/chat-assistant.service';
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
  @ViewChild('messageInput') private messageInput?: ElementRef<HTMLTextAreaElement>;

  isOpen = false;
  isProcessing = false;
  userInput = '';
  readonly chatPanelId = 'chat-assistant-panel';
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
    if (this.isOpen) {
      this.closeChat();
    } else {
      this.openChat();
    }
  }

  openChat(): void {
    if (this.isOpen) {
      this.focusInput();
      this.scrollToBottom();
      return;
    }

    this.isOpen = true;
    this.focusInput();
    this.scrollToBottom();
  }

  closeChat(): void {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
  }

  sendMessage(): void {
    const text = this.userInput.trim();
    if (!text || this.isProcessing) {
      return;
    }

    this.addMessage({ role: 'user', text, timestamp: new Date() });
    this.userInput = '';
    this.processUserMessage();
  }

  onTextareaKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: KeyboardEvent): void {
    if (!this.isOpen) {
      return;
    }

    event.preventDefault();
    this.closeChat();
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
        this.isProcessing = false;
      }
    });
  }

  private buildAssistantRequest(): ChatAssistantRequest {
    const messages: ChatAssistantMessage[] = this.messages
      .filter(message =>
        message.role === 'user' || (message.role === 'assistant' && (!message.variant || message.variant === 'default'))
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
      this.executeSearch(filters);
    } else {
      this.isProcessing = false;
    }
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

  private focusInput(): void {
    setTimeout(() => {
      this.messageInput?.nativeElement.focus();
    });
  }
}
