using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using API.DTOs;
using API.DTOs.Chat;
using API.Helpers;
using API.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API.Services
{
    public class ChatAssistantService : IChatAssistantService
    {
        private static readonly JsonSerializerOptions SerializerOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

        private static readonly HashSet<string> AllKeywords = new(StringComparer.OrdinalIgnoreCase)
        {
            "all",
            "الكل",
            "كل",
            "جميع",
            "بدون"
        };

        private readonly HttpClient _httpClient;
        private readonly OpenAiOptions _options;
        private readonly ILogger<ChatAssistantService> _logger;

        public ChatAssistantService(HttpClient httpClient, IOptions<OpenAiOptions> options, ILogger<ChatAssistantService> logger)
        {
            _httpClient = httpClient;
            _options = options.Value;
            _logger = logger;
        }

        public async Task<ChatInterpretationResponse> InterpretAsync(ChatInterpretationRequest request, CancellationToken cancellationToken = default)
        {
            if (request == null)
            {
                throw new ArgumentNullException(nameof(request));
            }

            if (string.IsNullOrWhiteSpace(_options.ApiKey))
            {
                return new ChatInterpretationResponse
                {
                    Success = false,
                    ShouldSearch = false,
                    Reply = "تعذر الاتصال بخدمة الذكاء الاصطناعي. يرجى التواصل مع مسؤول النظام لإعداد مفتاح OpenAI.",
                    Errors = { "Missing OpenAI API key." }
                };
            }

            try
            {
                var body = BuildRequestPayload(request);
                var endpoint = string.IsNullOrWhiteSpace(_options.Endpoint)
                    ? "https://api.openai.com/v1/chat/completions"
                    : _options.Endpoint;

                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
                httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);
                httpRequest.Headers.Accept.Clear();
                httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                if (!string.IsNullOrWhiteSpace(_options.Organization))
                {
                    httpRequest.Headers.Add("OpenAI-Organization", _options.Organization);
                }

                if (!string.IsNullOrWhiteSpace(_options.Project))
                {
                    httpRequest.Headers.Add("OpenAI-Project", _options.Project);
                }
                httpRequest.Content = new StringContent(body, Encoding.UTF8, "application/json");

                using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
                var rawContent = await response.Content.ReadAsStringAsync(cancellationToken);

                if (!response.IsSuccessStatusCode)
                {
                    var errorInfo = ExtractOpenAiError(rawContent);
                    _logger.LogError("OpenAI request failed with status {Status}: {Body}", response.StatusCode, rawContent);

                    var errorResponse = new ChatInterpretationResponse
                    {
                        Success = false,
                        ShouldSearch = false,
                        Reply = GetFriendlyOpenAiErrorMessage(response.StatusCode, errorInfo)
                    };

                    errorResponse.Errors.Add("فشل طلب OpenAI.");
                    if (!string.IsNullOrWhiteSpace(errorInfo.Message))
                    {
                        errorResponse.Errors.Add($"التفاصيل: {errorInfo.Message}");
                    }

                    return errorResponse;
                }

                var assistantJson = ExtractAssistantJson(rawContent);
                if (assistantJson == null)
                {
                    return new ChatInterpretationResponse
                    {
                        Success = false,
                        ShouldSearch = false,
                        Reply = "لم أتمكن من فهم الطلب بشكل كافٍ، حاول صياغته بصورة أوضح.",
                        Errors = { "Unable to read assistant response." }
                    };
                }

                return BuildInterpretationResponse(assistantJson.Value, request.Context);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to interpret chat request");
                return new ChatInterpretationResponse
                {
                    Success = false,
                    ShouldSearch = false,
                    Reply = "حدث خطأ غير متوقع أثناء تحليل الرسالة.",
                    Errors = { "Unexpected error." }
                };
            }
        }

        private string BuildRequestPayload(ChatInterpretationRequest request)
        {
            var promptBuilder = new StringBuilder();
            AppendLookupPrompt(promptBuilder, "البلديات", request.Context.Centers);
            AppendLookupPrompt(promptBuilder, "الأحياء", request.Context.Neighborhoods);
            AppendLookupPrompt(promptBuilder, "الطرق", request.Context.Roads);
            AppendLookupPrompt(promptBuilder, "التصنيفات الفرعية", request.Context.SubCategories);
            AppendLookupPrompt(promptBuilder, "الحالات", request.Context.Statuses);
            AppendLookupPrompt(promptBuilder, "درجات الخطورة", request.Context.Priorities);

            if (request.Context.PageSizeOptions.Any())
            {
                promptBuilder.AppendLine($"خيارات حجم الصفحة المتاحة: {string.Join(", ", request.Context.PageSizeOptions)}.");
            }

            if (request.Context.DefaultPageSize.HasValue)
            {
                promptBuilder.AppendLine($"الحجم الافتراضي للصفحة: {request.Context.DefaultPageSize.Value}.");
            }

            var systemMessage = new
            {
                role = "system",
                content = string.Join("\n", new[]
                {
                    "أنت مساعد افتراضي يساعد المستخدم على البحث في بلاغات الإعلام." ,
                    "حلل الرسائل الواردة واستخرج معايير البحث المناسبة إذا كان المستخدم يطلب استعلاماً.",
                    "أجب دائماً بصيغة JSON تحتوي على الحقول التالية: reply (نص الرد للمستخدم باللغة العربية)، shouldSearch (قيمة منطقية)، summary (وصف مختصر للمعايير بالعربية)، warnings (مصفوفة نصوص يمكن أن تكون فارغة)، filters (كائن).",
                    "يمكن أن يكون كائن filters فارغاً إذا لم يُطلب استعلام. عند وجود قيم حقول، استخدم القيم الرقمية للمعرفات من القوائم المتاحة أعلاه متى أمكن. في حال عدم اليقين اجعل القيمة null وأضف ملاحظة في warnings.",
                    "يجب أن يتضمن كائن filters الحقول التالية حسب الحاجة وبصيغة camelCase: search، centerId، neighborhoodId، roadId، subCategoryId، statusId، priorityId، pageSize.",
                    "إذا كانت الرسالة تحية أو محادثة عامة، اجعل shouldSearch = false وقدم رداً مناسباً.",
                    "إذا طلب المستخدم تصفية معينة ولم يتم توفير قيمة مناسبة، اشرح ذلك في warnings ولا تحاول التخمين." ,
                    "تذكر: استعمل المعرفات الرقمية فقط عندما تكون متأكدًا أنها تطابق أحد العناصر المتاحة." ,
                    promptBuilder.ToString()
                }.Where(l => !string.IsNullOrWhiteSpace(l)))
            };

            var messages = new List<object> { systemMessage };
            foreach (var message in request.Messages)
            {
                messages.Add(new { role = NormalizeRole(message.Role), content = message.Text });
            }

            var payload = new
            {
                model = _options.Model,
                temperature = 0,
                response_format = new { type = "json_object" },
                messages
            };

            return JsonSerializer.Serialize(payload, SerializerOptions);
        }

        private static void AppendLookupPrompt(StringBuilder builder, string title, IReadOnlyCollection<ChatLookupItemDto> items)
        {
            if (items.Count == 0)
            {
                return;
            }

            builder.AppendLine($"{title}: {string.Join(", ", items.Select(i => $"{i.Id}:{i.Name}"))}.");
        }

        private static string NormalizeRole(string role)
        {
            return role?.Equals("assistant", StringComparison.OrdinalIgnoreCase) == true ? "assistant" : "user";
        }

        private JsonElement? ExtractAssistantJson(string rawResponse)
        {
            using var document = JsonDocument.Parse(rawResponse);
            if (!document.RootElement.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
            {
                return null;
            }

            var message = choices[0].GetProperty("message");
            if (!message.TryGetProperty("content", out var contentElement))
            {
                return null;
            }

            var content = contentElement.GetString();
            if (string.IsNullOrWhiteSpace(content))
            {
                return null;
            }

            using var contentDocument = JsonDocument.Parse(content);
            return contentDocument.RootElement.Clone();
        }

        private static OpenAiErrorInfo ExtractOpenAiError(string rawResponse)
        {
            if (string.IsNullOrWhiteSpace(rawResponse))
            {
                return default;
            }

            try
            {
                using var document = JsonDocument.Parse(rawResponse);
                if (document.RootElement.TryGetProperty("error", out var errorElement))
                {
                    if (errorElement.ValueKind == JsonValueKind.String)
                    {
                        return new OpenAiErrorInfo(errorElement.GetString(), null);
                    }

                    if (errorElement.ValueKind == JsonValueKind.Object)
                    {
                        string? message = null;
                        string? code = null;

                        if (errorElement.TryGetProperty("message", out var messageElement) && messageElement.ValueKind == JsonValueKind.String)
                        {
                            message = messageElement.GetString();
                        }

                        if (errorElement.TryGetProperty("code", out var codeElement) && codeElement.ValueKind == JsonValueKind.String)
                        {
                            code = codeElement.GetString();
                        }

                        if (!string.IsNullOrWhiteSpace(message) || !string.IsNullOrWhiteSpace(code))
                        {
                            return new OpenAiErrorInfo(message, code);
                        }
                    }
                }
            }
            catch
            {
                return default;
            }

            return default;
        }

        private static string GetFriendlyOpenAiErrorMessage(System.Net.HttpStatusCode statusCode, OpenAiErrorInfo errorInfo)
        {
            if (statusCode == System.Net.HttpStatusCode.Unauthorized || string.Equals(errorInfo.Code, "invalid_api_key", StringComparison.OrdinalIgnoreCase))
            {
                return "تعذر التحقق من مفتاح OpenAI. يرجى التأكد من صحته أو طلب مفتاح جديد.";
            }

            if (statusCode == System.Net.HttpStatusCode.TooManyRequests || string.Equals(errorInfo.Code, "insufficient_quota", StringComparison.OrdinalIgnoreCase) || (errorInfo.Message?.IndexOf("quota", StringComparison.OrdinalIgnoreCase) >= 0))
            {
                return "تم تجاوز الحد المتاح من استخدام خدمة OpenAI. يرجى مراجعة خطة الاشتراك أو استخدام مفتاح مشروع فعّال.";
            }

            if (statusCode == System.Net.HttpStatusCode.Forbidden)
            {
                return "لا تملك الصلاحيات اللازمة للوصول إلى نموذج OpenAI المطلوب. تحقق من إعدادات المشروع أو الصلاحيات.";
            }

            return "حدث خطأ أثناء معالجة الطلب، يرجى المحاولة لاحقاً.";
        }

        private readonly struct OpenAiErrorInfo
        {
            public OpenAiErrorInfo(string? message, string? code)
            {
                Message = message;
                Code = code;
            }

            public string? Message { get; }

            public string? Code { get; }
        }

        private ChatInterpretationResponse BuildInterpretationResponse(JsonElement assistantRoot, ChatContextDto context)
        {
            var response = new ChatInterpretationResponse
            {
                Reply = assistantRoot.TryGetProperty("reply", out var replyElement) ? replyElement.GetString() : null,
                Summary = assistantRoot.TryGetProperty("summary", out var summaryElement) ? summaryElement.GetString() : null,
                ShouldSearch = assistantRoot.TryGetProperty("shouldSearch", out var shouldSearchElement) && ReadBoolean(shouldSearchElement),
            };

            if (assistantRoot.TryGetProperty("warnings", out var warningsElement) && warningsElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var warning in warningsElement.EnumerateArray())
                {
                    var text = warning.GetString();
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        response.Warnings.Add(text);
                    }
                }
            }

            if (assistantRoot.TryGetProperty("errors", out var errorsElement) && errorsElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var error in errorsElement.EnumerateArray())
                {
                    var text = error.GetString();
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        response.Errors.Add(text);
                    }
                }
            }

            if (!assistantRoot.TryGetProperty("filters", out var filtersElement) || filtersElement.ValueKind != JsonValueKind.Object)
            {
                response.Success = response.ShouldSearch == false;
                return response;
            }

            var filters = new MediaIncidentQueryParams
            {
                PageNumber = 1
            };

            var mappingWarnings = new List<string>();

            if (TryGetString(filtersElement, "search", out var search))
            {
                filters.Search = string.IsNullOrWhiteSpace(search) ? null : search;
            }

            filters.CenterId = ResolveLookup(filtersElement, "centerId", context.Centers, mappingWarnings);
            filters.NeighborhoodId = ResolveLookup(filtersElement, "neighborhoodId", context.Neighborhoods, mappingWarnings);
            filters.RoadId = ResolveLookup(filtersElement, "roadId", context.Roads, mappingWarnings);
            filters.SubCategoryId = ResolveLookup(filtersElement, "subCategoryId", context.SubCategories, mappingWarnings);
            filters.StatusId = ResolveLookup(filtersElement, "statusId", context.Statuses, mappingWarnings);
            filters.PriorityId = ResolveLookup(filtersElement, "priorityId", context.Priorities, mappingWarnings);

            if (TryGetNumber(filtersElement, "pageSize", out var pageSize))
            {
                filters.PageSize = pageSize;
                if (context.PageSizeOptions.Any() && !context.PageSizeOptions.Contains(pageSize))
                {
                    mappingWarnings.Add($"حجم الصفحة {pageSize} خارج الخيارات المسموح بها ({string.Join(", ", context.PageSizeOptions)}).");
                }
            }
            else if (context.DefaultPageSize.HasValue)
            {
                filters.PageSize = context.DefaultPageSize.Value;
            }

            foreach (var warning in mappingWarnings)
            {
                if (!response.Warnings.Contains(warning))
                {
                    response.Warnings.Add(warning);
                }
            }

            response.Filters = filters;
            response.Success = response.ShouldSearch && (filters.Search != null || filters.CenterId != null || filters.NeighborhoodId != null || filters.RoadId != null ||
                                 filters.SubCategoryId != null || filters.StatusId != null || filters.PriorityId != null || filters.PageSize.HasValue);

            if (response.ShouldSearch && !response.Success)
            {
                response.Errors.Add("لم يتمكن النظام من تحديد أي معيار صالح لتنفيذ الاستعلام.");
            }

            return response;
        }

        private static bool TryGetString(JsonElement element, string propertyName, out string? value)
        {
            value = null;
            if (!element.TryGetProperty(propertyName, out var property))
            {
                return false;
            }

            if (property.ValueKind == JsonValueKind.Null)
            {
                return true;
            }

            if (property.ValueKind == JsonValueKind.Number)
            {
                value = property.GetRawText();
                return true;
            }

            if (property.ValueKind == JsonValueKind.String)
            {
                value = property.GetString();
                return true;
            }

            return false;
        }

        private static bool TryGetNumber(JsonElement element, string propertyName, out int value)
        {
            value = 0;
            if (!element.TryGetProperty(propertyName, out var property))
            {
                return false;
            }

            if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var intValue))
            {
                value = intValue;
                return true;
            }

            if (property.ValueKind == JsonValueKind.String)
            {
                var digits = ConvertDigits(property.GetString());
                if (int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
                {
                    value = parsed;
                    return true;
                }
            }

            return false;
        }

        private static bool ReadBoolean(JsonElement element)
        {
            return element.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Number => element.TryGetInt32(out var numeric) && numeric != 0,
                JsonValueKind.String => bool.TryParse(element.GetString(), out var parsed) && parsed,
                _ => false
            };
        }

        private static int? ResolveLookup(JsonElement filtersElement, string propertyName, IReadOnlyCollection<ChatLookupItemDto> items, List<string> warnings)
        {
            if (!TryGetString(filtersElement, propertyName, out var rawValue) || string.IsNullOrWhiteSpace(rawValue))
            {
                return null;
            }

            var normalized = Normalize(rawValue);
            if (string.IsNullOrEmpty(normalized))
            {
                return null;
            }

            if (AllKeywords.Contains(normalized))
            {
                return null;
            }

            var numericCandidateText = ConvertDigits(rawValue);
            if (int.TryParse(numericCandidateText, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numericCandidate))
            {
                var matchById = items.FirstOrDefault(item => item.Id == numericCandidate);
                if (matchById != null)
                {
                    return matchById.Id;
                }
            }

            var matchByName = items.FirstOrDefault(item => Normalize(item.Name) == normalized);
            if (matchByName != null)
            {
                return matchByName.Id;
            }

            var partialMatch = items.FirstOrDefault(item => Normalize(item.Name).Contains(normalized));
            if (partialMatch != null)
            {
                return partialMatch.Id;
            }

            warnings.Add($"تعذر مطابقة القيمة \"{rawValue}\" مع أي خيار متاح لحقل {propertyName}.");
            return null;
        }

        private static string Normalize(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return string.Empty;
            }

            var normalized = value.ToLowerInvariant();
            normalized = normalized.Normalize(NormalizationForm.FormC);
            normalized = RemoveDiacritics(normalized);
            normalized = System.Text.RegularExpressions.Regex.Replace(normalized, "[^\u0600-\u06FF0-9a-zA-Z\s]", "");
            normalized = System.Text.RegularExpressions.Regex.Replace(normalized, "\s+", " ");
            return normalized.Trim();
        }

        private static string ConvertDigits(string? value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            var sb = new StringBuilder(value.Length);
            foreach (var ch in value)
            {
                if (ch >= '\u0660' && ch <= '\u0669')
                {
                    sb.Append((char)('0' + (ch - '\u0660')));
                }
                else
                {
                    sb.Append(ch);
                }
            }

            return sb.ToString();
        }

        private static string RemoveDiacritics(string text)
        {
            if (string.IsNullOrEmpty(text))
            {
                return text;
            }

            var sb = new StringBuilder(text.Length);
            foreach (var ch in text)
            {
                if (ch >= '\u064B' && ch <= '\u0652')
                {
                    continue;
                }

                sb.Append(ch);
            }

            return sb.ToString();
        }
    }
}
