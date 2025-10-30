import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MediaIncident, MediaIncidentFilters, PaginatedResponse } from '../models/media-incident';
import { LookupItem } from '../models/lookup';
import { ChatAssistantMessage, ChatAssistantRequest, ChatAssistantResponse, ChatAssistantService } from '../services/chat-assistant.service';
import { MediaIncidentService } from '../services/media-incident.service';
import { ReportGenerationPayload, ReportService } from '../services/report.service';

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
  isGeneratingReport = false;
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
    private readonly chatAssistantService: ChatAssistantService,
    private readonly reportService: ReportService
  ) {}

  toggleChat(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.scrollToBottom();
    }
  }

  get hasConversationForReport(): boolean {
    return this.messages.some(message =>
      message.includeInConversation !== false &&
      (message.role === 'user' || (message.role === 'assistant' && (!message.variant || message.variant === 'default')))
    );
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

  generateReportFromConversation(): void {
    if (this.isGeneratingReport) {
      return;
    }

    const prompt = this.buildConversationReportPrompt();
    if (!prompt) {
      this.addMessage({
        role: 'assistant',
        text: 'لا توجد محادثة كافية لإنشاء تقرير حتى الآن.',
        timestamp: new Date(),
        variant: 'error',
        includeInConversation: false
      });
      return;
    }

    this.isGeneratingReport = true;
    this.addMessage({
      role: 'assistant',
      text: 'جارٍ تجهيز عرض تقديمي بناءً على سياق المحادثة...',
      timestamp: new Date(),
      variant: 'status',
      includeInConversation: false
    });

    const payload: ReportGenerationPayload = {
      prompt,
      reportTitle: 'تقرير جلسة المساعد'
    };

    this.reportService.generate(payload).subscribe({
      next: blob => {
        this.isGeneratingReport = false;
        this.downloadReport(blob, 'chat-session-report');
        this.addMessage({
          role: 'assistant',
          text: 'تم إنشاء التقرير وتحميله بنجاح.',
          timestamp: new Date(),
          variant: 'status',
          includeInConversation: false
        });
      },
      error: () => {
        this.isGeneratingReport = false;
        this.addMessage({
          role: 'assistant',
          text: 'تعذر إنشاء التقرير حالياً، يرجى المحاولة لاحقاً.',
          timestamp: new Date(),
          variant: 'error',
          includeInConversation: false
        });
      }
    });
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

  private buildConversationReportPrompt(): string | null {
    const relevantMessages = this.messages.filter(message =>
      message.includeInConversation !== false &&
      (message.role === 'user' || (message.role === 'assistant' && (!message.variant || message.variant === 'default')))
    );

    if (!relevantMessages.length) {
      return null;
    }

    const transcript = relevantMessages
      .map(message => `${message.role === 'user' ? 'المستخدم' : 'المساعد'}: ${message.text}`)
      .join('\n');

    const filtersSummary = this.pendingSearchFilters
      ? `\n\nعوامل التصفية المقترحة: ${JSON.stringify(this.pendingSearchFilters)}`
      : '';

    return [
      'حوّل المحادثة التالية إلى عرض تقديمي موجز ومنظم باللغة العربية.',
      'استخدم شرائح تتضمن مقدمة، ملخصاً تنفيذياً، أبرز النتائج، والتوصيات العملية.',
      transcript,
      filtersSummary,
      '\nاعتمد أسلوباً مهنياً وركز على أهم النقاط التي تهم المستخدم.'
    ].join('\n');
  }

  private downloadReport(blob: Blob, baseFileName: string): void {
    const fileName = `${baseFileName}.pptx`;
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
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
