using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using API.DTOs.Reports;
using API.Interfaces;
using API.Models.Reports;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ReportController : ControllerBase
    {
        private readonly IReportGenerationService _reportGenerationService;
        private readonly ILogger<ReportController> _logger;

        public ReportController(
            IReportGenerationService reportGenerationService,
            ILogger<ReportController> logger)
        {
            _reportGenerationService = reportGenerationService;
            _logger = logger;
        }

        [HttpPost("generate")]
        public async Task<IActionResult> Generate([FromBody] ReportGenerationRequestDto dto, CancellationToken cancellationToken)
        {
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }

            if (dto is null)
            {
                return BadRequest("Missing request body.");
            }

            try
            {
                var request = MapRequest(dto);
                var result = await _reportGenerationService.GenerateAsync(request, cancellationToken).ConfigureAwait(false);

                return File(result.Content, result.ContentType, result.FileName);
            }
            catch (FileNotFoundException ex)
            {
                _logger.LogError(ex, "Report template missing.");
                return StatusCode(500, new { message = "تعذر العثور على قالب العرض التقديمي. يرجى رفع الملف إلى المسار المحدد." });
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Report generation request was invalid.");
                return BadRequest(new { message = ex.Message });
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to generate report.");
                return StatusCode(500, new { message = "حدث خطأ غير متوقع أثناء إنشاء التقرير." });
            }
        }

        private static ReportGenerationRequest MapRequest(ReportGenerationRequestDto dto)
        {
            var sections = dto.Sections?
                .Where(section => section != null)
                .Select(section => new ReportSection
                {
                    Title = section.Title ?? string.Empty,
                    Body = section.Body,
                    BulletPoints = section.BulletPoints?.Where(point => !string.IsNullOrWhiteSpace(point)).ToList()
                        ?? new System.Collections.Generic.List<string>()
                })
                .ToList()
                ?? new System.Collections.Generic.List<ReportSection>();

            return new ReportGenerationRequest
            {
                Prompt = dto.Prompt,
                TemplateName = dto.TemplateName,
                ReportTitle = dto.ReportTitle,
                Summary = dto.Summary,
                Sections = sections
            };
        }
    }
}
