using System.Collections.Generic;

namespace API.Helpers
{
    public class MailSettings
    {
        public string Host { get; set; } = string.Empty;
        public int Port { get; set; } = 25;
        public string UserName { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string SenderName { get; set; } = string.Empty;
        public string? SenderEmail { get; set; }
        public bool EnableSsl { get; set; } = true;
        public List<string> AlertRecipients { get; set; } = new();
    }
}
