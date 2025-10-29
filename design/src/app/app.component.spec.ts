import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';

import { AppComponent } from './app.component';
import { ChatAssistantComponent } from './chat-assistant/chat-assistant.component';
import { ChatAssistantService } from './services/chat-assistant.service';
import { MediaIncidentService } from './services/media-incident.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, ReactiveFormsModule, FormsModule],
      declarations: [AppComponent, ChatAssistantComponent],
      providers: [
        {
          provide: MediaIncidentService,
          useValue: {
            getIncidents: () =>
              of({
                data: [],
                pagination: {
                  currentPage: 1,
                  pageSize: 10,
                  totalCount: 0,
                  totalPages: 0
                }
              })
          }
        },
        {
          provide: ChatAssistantService,
          useValue: {
            interpret: () =>
              of({
                success: true,
                shouldSearch: false,
                filters: null,
                reply: null,
                summary: null,
                warnings: [],
                errors: []
              }),
            buildContextFromLookups: () => ({
              centers: [],
              neighborhoods: [],
              roads: [],
              priorities: [],
              statuses: [],
              subCategories: [],
              pageSizeOptions: [],
              defaultPageSize: 10
            })
          }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
