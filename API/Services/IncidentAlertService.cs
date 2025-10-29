using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
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
                    await _emailSender.SendEmailAsync(_recipients, subject, body, cancellationToken).ConfigureAwait(false);

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
            var builder = new StringBuilder();
            builder.AppendLine("تم تسجيل بلاغ حرج / خطر.");
            builder.AppendLine();
            builder.AppendLine($"رقم البلاغ: {incident.IncidentId}");

            if (!string.IsNullOrWhiteSpace(incident.RefId))
            {
                builder.AppendLine($"الرقم المرجعي: {incident.RefId}");
            }

            if (!string.IsNullOrWhiteSpace(incident.PriorityName))
            {
                builder.AppendLine($"درجة الأولوية: {incident.PriorityName}");
            }

            if (!string.IsNullOrWhiteSpace(incident.MainCategoryName))
            {
                builder.AppendLine($"التصنيف الرئيسي: {incident.MainCategoryName}");
            }

            if (!string.IsNullOrWhiteSpace(incident.SubCategoryName))
            {
                builder.AppendLine($"التصنيف الفرعي: {incident.SubCategoryName}");
            }

            if (!string.IsNullOrWhiteSpace(incident.StatusName))
            {
                builder.AppendLine($"الحالة: {incident.StatusName}");
            }

            if (!string.IsNullOrWhiteSpace(incident.CenterName))
            {
                builder.AppendLine($"المركز: {incident.CenterName}");
            }

            if (!string.IsNullOrWhiteSpace(incident.NeighborhoodName))
            {
                builder.AppendLine($"الحي: {incident.NeighborhoodName}");
            }

            if (!string.IsNullOrWhiteSpace(incident.RoadName))
            {
                builder.AppendLine($"الطريق: {incident.RoadName}");
            }

            if (!string.IsNullOrWhiteSpace(incident.SourceOfIncident))
            {
                builder.AppendLine($"مصدر البلاغ: {incident.SourceOfIncident}");
            }

            builder.AppendLine($"تاريخ الإنشاء (UTC): {incident.CreatedAt:yyyy-MM-dd HH:mm:ss}");

            if (incident.Lat.HasValue && incident.Lng.HasValue)
            {
                builder.AppendLine($"الإحداثيات: {incident.Lat.Value}, {incident.Lng.Value}");
            }

            if (!string.IsNullOrWhiteSpace(incident.RepresentativeImageUrl))
            {
                builder.AppendLine($"صورة البلاغ: {incident.RepresentativeImageUrl}");
            }

            builder.AppendLine();
            builder.AppendLine($"رابط التفاصيل: http://144.76.146.61:9883/incident/details/{incident.IncidentId}");

            return builder.ToString();
        }
    }
}
