import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';

import { AppComponent } from './app.component';
import { MediaIncidentService } from './services/media-incident.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, ReactiveFormsModule],
      declarations: [AppComponent],
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
