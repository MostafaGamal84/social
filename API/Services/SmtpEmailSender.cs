using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Mail;
using System.Threading;
using System.Threading.Tasks;
using API.Helpers;
using API.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API.Services
{
    public class SmtpEmailSender : IEmailSender
    {
        private readonly MailSettings _settings;
        private readonly ILogger<SmtpEmailSender> _logger;

        public SmtpEmailSender(IOptions<MailSettings> options, ILogger<SmtpEmailSender> logger)
        {
            _settings = options?.Value ?? throw new ArgumentNullException(nameof(options));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task SendEmailAsync(IEnumerable<string> recipients, string subject, string body, CancellationToken cancellationToken = default)
        {
            if (recipients == null)
            {
                return;
            }

            var recipientList = recipients
                .Where(r => !string.IsNullOrWhiteSpace(r))
                .Select(r => r.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (recipientList.Count == 0)
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(_settings.Host) || _settings.Port <= 0)
            {
                _logger.LogWarning("SMTP settings are not configured correctly. Email will not be sent.");
                return;
            }

            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            using var smtpClient = new SmtpClient(_settings.Host, _settings.Port)
            {
                EnableSsl = _settings.EnableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                UseDefaultCredentials = false,
                Credentials = new NetworkCredential(_settings.UserName, _settings.Password)
            };

            var fromAddress = !string.IsNullOrWhiteSpace(_settings.SenderEmail)
                ? new MailAddress(_settings.SenderEmail, _settings.SenderName)
                : new MailAddress(_settings.UserName, _settings.SenderName);

            using var message = new MailMessage
            {
                From = fromAddress,
                Subject = subject,
                Body = body,
                IsBodyHtml = false
            };

            foreach (var recipient in recipientList)
            {
                message.To.Add(recipient);
            }

            try
            {
                await smtpClient.SendMailAsync(message).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send email with subject {Subject}.", subject);
                throw;
            }
        }
    }
}
