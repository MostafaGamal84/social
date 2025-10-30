using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using API.Helpers;
using API.Interfaces;
using API.Models.Reports;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API.Services
{
    public class OpenAiReportContentService : IAiReportContentService
    {
        private static readonly JsonSerializerOptions SerializerOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

        private readonly HttpClient _httpClient;
        private readonly OpenAiOptions _options;
        private readonly ILogger<OpenAiReportContentService> _logger;

        public OpenAiReportContentService(
            HttpClient httpClient,
            IOptions<OpenAiOptions> options,
            ILogger<OpenAiReportContentService> logger)
        {
            _httpClient = httpClient;
            _options = options.Value;
            _logger = logger;
        }

        public async Task<GeneratedReportContent> GenerateContentAsync(string prompt, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(prompt))
            {
                throw new ArgumentException("Prompt is required to generate report content.", nameof(prompt));
            }

            if (string.IsNullOrWhiteSpace(_options.ApiKey))
            {
                _logger.LogWarning("OpenAI API key is missing. Falling back to minimal content generated from prompt snippet.");
                return BuildFallbackContent(prompt);
            }

            try
            {
                var endpoint = string.IsNullOrWhiteSpace(_options.Endpoint)
                    ? "https://api.openai.com/v1/chat/completions"
                    : _options.Endpoint;

                using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);
                request.Headers.Accept.Clear();
                request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

                if (!string.IsNullOrWhiteSpace(_options.Organization))
                {
                    request.Headers.Add("OpenAI-Organization", _options.Organization);
                }

                if (!string.IsNullOrWhiteSpace(_options.Project))
                {
                    request.Headers.Add("OpenAI-Project", _options.Project);
                }

                request.Content = new StringContent(BuildPayload(prompt), Encoding.UTF8, "application/json");

                using var response = await _httpClient.SendAsync(request, cancellationToken);
                var rawContent = await response.Content.ReadAsStringAsync(cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError(
                        "OpenAI report content request failed with status {Status}: {Body}",
                        response.StatusCode,
                        rawContent);

                    return BuildFallbackContent(prompt);
                }

                var reportContent = ParseResponse(rawContent);
                return reportContent ?? BuildFallbackContent(prompt);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to generate report content via OpenAI.");
                return BuildFallbackContent(prompt);
            }
        }

        private string BuildPayload(string prompt)
        {
            var payload = new
            {
                model = _options.Model,
                temperature = 0.5,
                response_format = new { type = "json_object" },
                messages = new object[]
                {
                    new
                    {
                        role = "system",
                        content = string.Join("\n", new[]
                        {
                            "You are an assistant that prepares structured presentation outlines.",
                            "Always reply with JSON containing: title (string), summary (string), sections (array).",
                            "Each section must have title (string), body (string) and bulletPoints (array of strings).",
                            "Bullet points should be concise action-oriented statements.",
                            "Provide between 3 and 6 sections when possible."
                        })
                    },
                    new { role = "user", content = prompt }
                }
            };

            return JsonSerializer.Serialize(payload, SerializerOptions);
        }

        private GeneratedReportContent? ParseResponse(string responseBody)
        {
            try
            {
                using var json = JsonDocument.Parse(responseBody);
                var root = json.RootElement;
                if (!root.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
                {
                    return null;
                }

                var firstChoice = choices[0];
                if (!firstChoice.TryGetProperty("message", out var message) || !message.TryGetProperty("content", out var content))
                {
                    return null;
                }

                var payload = content.GetString();
                if (string.IsNullOrWhiteSpace(payload))
                {
                    return null;
                }

                using var structured = JsonDocument.Parse(payload);
                var result = new GeneratedReportContent
                {
                    Title = structured.RootElement.TryGetProperty("title", out var titleElement)
                        ? titleElement.GetString()
                        : null,
                    Summary = structured.RootElement.TryGetProperty("summary", out var summaryElement)
                        ? summaryElement.GetString()
                        : null,
                    Sections = structured.RootElement.TryGetProperty("sections", out var sectionsElement)
                        ? sectionsElement
                            .EnumerateArray()
                            .Select(sectionElement => new ReportSection
                            {
                                Title = sectionElement.TryGetProperty("title", out var sectionTitle)
                                    ? sectionTitle.GetString() ?? string.Empty
                                    : string.Empty,
                                Body = sectionElement.TryGetProperty("body", out var bodyElement)
                                    ? bodyElement.GetString()
                                    : null,
                                BulletPoints = sectionElement.TryGetProperty("bulletPoints", out var bulletsElement)
                                    ? bulletsElement.EnumerateArray().Select(b => b.GetString() ?? string.Empty).ToList()
                                    : Array.Empty<string>()
                            })
                            .ToList()
                        : Array.Empty<ReportSection>()
                };

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unable to parse OpenAI report content response.");
                return null;
            }
        }

        private static GeneratedReportContent BuildFallbackContent(string prompt)
        {
            var summary = prompt.Length > 200 ? prompt[..200] + "…" : prompt;
            return new GeneratedReportContent
            {
                Title = "ملخص التقرير",
                Summary = summary,
                Sections = new[]
                {
                    new ReportSection
                    {
                        Title = "نظرة عامة",
                        Body = summary,
                        BulletPoints = new[]
                        {
                            "تم إنشاء هذا المحتوى باستخدام بيانات الإدخال المتاحة فقط.",
                            "أضف مفتاح OpenAI للحصول على ملخص تفصيلي وأقسام موسعة."
                        }
                    }
                }
            };
        }
    }
}
