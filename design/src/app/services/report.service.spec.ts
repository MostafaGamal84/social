import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { ReportGenerationPayload, ReportService } from './report.service';

describe('ReportService', () => {
  let service: ReportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ReportService]
    });

    service = TestBed.inject(ReportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sends a POST request to generate reports and returns a blob', () => {
    const payload: ReportGenerationPayload = { reportTitle: 'Test Report', prompt: 'Summarize findings' };
    const responseBlob = new Blob(['demo'], { type: 'application/octet-stream' });

    service.generate(payload).subscribe(result => {
      expect(result).toBeInstanceOf(Blob);
      expect(result.size).toBe(responseBlob.size);
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/report/generate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    expect(req.request.responseType).toBe('blob');
    req.flush(responseBlob);
  });
});
