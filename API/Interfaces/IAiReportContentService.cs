using System.Threading;
using System.Threading.Tasks;
using API.Models.Reports;

namespace API.Interfaces
{
    public interface IAiReportContentService
    {
        Task<GeneratedReportContent> GenerateContentAsync(string prompt, CancellationToken cancellationToken = default);
    }
}
