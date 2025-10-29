using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace API.Interfaces
{
    public interface IEmailSender
    {
        Task SendEmailAsync(IEnumerable<string> recipients, string subject, string body, CancellationToken cancellationToken = default);
    }
}
