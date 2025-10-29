using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using API.Data;
using API.DTOs;
using API.Entities;
using API.Helpers;
using API.Interfaces;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API.Services
{
    public class IncidentAlertService : IIncidentAlertService
    {
        private static readonly ConcurrentDictionary<int, byte> NotifiedIncidents = new();

        private readonly IEmailSender _emailSender;
        private readonly ILogger<IncidentAlertService> _logger;
        private readonly IReadOnlyCollection<string> _recipients;
        private readonly IServiceScopeFactory _scopeFactory;

        public IncidentAlertService(
            IEmailSender emailSender,
            IOptions<MailSettings> mailOptions,
            ILogger<IncidentAlertService> logger,
            IServiceScopeFactory scopeFactory)
        {
            _emailSender = emailSender ?? throw new ArgumentNullException(nameof(emailSender));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _scopeFactory = scopeFactory ?? throw new ArgumentNullException(nameof(scopeFactory));

            if (mailOptions == null)
            {
                throw new ArgumentNullException(nameof(mailOptions));
            }

            _recipients = (mailOptions.Value.AlertRecipients ?? new List<string>())
                .Where(r => !string.IsNullOrWhiteSpace(r))
                .Select(r => r.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        public async Task NotifyCriticalIncidentsAsync(IEnumerable<MediaIncidentDto> incidents, CancellationToken cancellationToken = default)
        {
            if (incidents == null || _recipients.Count == 0)
            {
                return;
            }

            foreach (var incident in incidents)
            {
                if (!IsAlertPriority(incident.PriorityName) || !IsNewStatus(incident))
                {
                    continue;
                }

                if (!NotifiedIncidents.TryAdd(incident.IncidentId, 0))
                {
                    continue;
                }

                var subject = $"بلاغ عاجل ({incident.PriorityName ?? "غير معروف"}) - {incident.RefId ?? incident.IncidentId.ToString(CultureInfo.InvariantCulture)}";
                var body = BuildBody(incident);

                IncidentNotification? notificationRecord = null;

                await using var scope = _scopeFactory.CreateAsyncScope();
                var context = scope.ServiceProvider.GetRequiredService<DataContext>();

                try
                {
                    notificationRecord = new IncidentNotification
                    {
                        IncidentId = incident.IncidentId,
                        CreatedAtUtc = DateTime.UtcNow
                    };

                    context.IncidentNotifications.Add(notificationRecord);
                    await context.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (DbUpdateException dbUpdateException) when (IsDuplicateNotificationException(dbUpdateException))
                {
                    continue;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to record notification entry for incident {IncidentId}.", incident.IncidentId);
                    NotifiedIncidents.TryRemove(incident.IncidentId, out _);
                    continue;
                }

                try
                {
                    await _emailSender
                        .SendEmailAsync(_recipients, subject, body, isBodyHtml: true, cancellationToken: cancellationToken)
                        .ConfigureAwait(false);

                    if (notificationRecord != null)
                    {
                        notificationRecord.SentAtUtc = DateTime.UtcNow;
                        await context.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to send alert email for incident {IncidentId}.", incident.IncidentId);
                    NotifiedIncidents.TryRemove(incident.IncidentId, out _);

                    if (notificationRecord != null)
                    {
                        context.IncidentNotifications.Remove(notificationRecord);

                        try
                        {
                            await context.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
                        }
                        catch (Exception cleanupEx)
                        {
                            _logger.LogWarning(cleanupEx, "Failed to cleanup notification record for incident {IncidentId} after email failure.", incident.IncidentId);
                        }
                    }
                }
            }
        }

        private static bool IsDuplicateNotificationException(DbUpdateException exception)
        {
            if (exception.InnerException is SqlException sqlException)
            {
                return sqlException.Number == 2627 || sqlException.Number == 2601;
            }

            return false;
        }

        private static bool IsAlertPriority(string? priorityName)
        {
            if (string.IsNullOrWhiteSpace(priorityName))
            {
                return false;
            }

            var normalized = priorityName.Trim();
            return normalized.Equals("خطر", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("حرج", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("Danger", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("Critical", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsNewStatus(MediaIncidentDto incident)
        {
            return IsNewStatusName(incident.StatusName)
                || IsNewStatusName(incident.StatusArabicName)
                || IsNewStatusName(incident.StatusEnglishName);
        }

        private static bool IsNewStatusName(string? statusName)
        {
            if (string.IsNullOrWhiteSpace(statusName))
            {
                return false;
            }

            var normalized = statusName.Trim();
            return normalized.Equals("جديد", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("New", StringComparison.OrdinalIgnoreCase);
        }

        private static string BuildBody(MediaIncidentDto incident)
        {
            var rows = new List<(string Label, string Value)>();

            void AddRow(string label, string? value)
            {
                if (string.IsNullOrWhiteSpace(value))
                {
                    return;
                }

                rows.Add((label, WebUtility.HtmlEncode(value.Trim())));
            }

            static string CreateLink(string url, string text)
            {
                var encodedUrl = WebUtility.HtmlEncode(url);
                var encodedText = WebUtility.HtmlEncode(text);
                return $"<a href=\"{encodedUrl}\" target=\"_blank\" rel=\"noopener noreferrer\">{encodedText}</a>";
            }

            AddRow("رقم البلاغ", incident.IncidentId.ToString(CultureInfo.InvariantCulture));
            AddRow("الرقم المرجعي", incident.RefId);
            AddRow("درجة الأولوية", incident.PriorityName);
            AddRow("التصنيف الرئيسي", incident.MainCategoryName);
            AddRow("التصنيف الفرعي", incident.SubCategoryName);
            var statusDisplay = incident.StatusName ?? incident.StatusArabicName ?? incident.StatusEnglishName;
            AddRow("الحالة", statusDisplay);
            AddRow("المركز", incident.CenterName);
            AddRow("الحي", incident.NeighborhoodName);
            AddRow("الطريق", incident.RoadName);
            AddRow("مصدر البلاغ", incident.SourceOfIncident);
            AddRow("تاريخ الإنشاء (UTC)", incident.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture));

            if (incident.Lat.HasValue && incident.Lng.HasValue)
            {
                var lat = incident.Lat.Value.ToString("F6", CultureInfo.InvariantCulture);
                var lng = incident.Lng.Value.ToString("F6", CultureInfo.InvariantCulture);
                var mapsUrl = $"https://www.google.com/maps?q={lat},{lng}";
                var mapLink = CreateLink(mapsUrl, "عرض على الخريطة");
                var coordinatesValue = $"{WebUtility.HtmlEncode(lat)}, {WebUtility.HtmlEncode(lng)}<br/>{mapLink}";
                rows.Add(("الإحداثيات", coordinatesValue));
            }

            if (!string.IsNullOrWhiteSpace(incident.RepresentativeImageUrl))
            {
                var imageUrl = incident.RepresentativeImageUrl.Trim();
                var imageLink = CreateLink(imageUrl, "عرض الصورة");
                var imageValue = $"{imageLink}<br/><span style=\"font-size:12px;color:#6b7280;\">{WebUtility.HtmlEncode(imageUrl)}</span>";
                rows.Add(("صورة البلاغ", imageValue));
            }

            var detailsUrl = $"http://144.76.146.61:9883/incident/details/{incident.IncidentId}";
            rows.Add(("رابط التفاصيل", CreateLink(detailsUrl, "عرض تفاصيل البلاغ")));

            var builder = new StringBuilder();
            builder.AppendLine("<!DOCTYPE html>");
            builder.AppendLine("<html lang=\"ar\" dir=\"rtl\">\n<head><meta charset=\"utf-8\"></head>");
            builder.AppendLine("<body style=\"font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;text-align:right;background-color:#f9fafb;color:#111827;\">");
            builder.AppendLine("<div style=\"max-width:640px;margin:0 auto;padding:16px;\">");
            builder.AppendLine("<h2 style=\"color:#b91c1c;margin-top:0;\">تنبيه بلاغ حرج</h2>");
            builder.AppendLine("<p>تم تسجيل بلاغ حرج / خطر. فيما يلي التفاصيل:</p>");
            builder.AppendLine("<table style=\"width:100%;border-collapse:collapse;background-color:#ffffff;\">");
            builder.AppendLine("<tbody>");

            foreach (var (label, value) in rows)
            {
                builder.AppendLine("<tr>");
                builder.AppendLine($"<th style=\"width:30%;text-align:right;border:1px solid #e5e7eb;padding:8px;background-color:#f3f4f6;\">{WebUtility.HtmlEncode(label)}</th>");
                builder.AppendLine($"<td style=\"border:1px solid #e5e7eb;padding:8px;\">{value}</td>");
                builder.AppendLine("</tr>");
            }

            builder.AppendLine("</tbody>");
            builder.AppendLine("</table>");
            builder.AppendLine("<p style=\"margin-top:16px;color:#6b7280;font-size:12px;\">تم إرسال هذه الرسالة تلقائيًا، الرجاء عدم الرد عليها.</p>");
            builder.AppendLine("</div>");
            builder.AppendLine("</body></html>");

            return builder.ToString();
        }
    }
}
