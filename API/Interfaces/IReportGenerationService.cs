using System.Threading;
using System.Threading.Tasks;
using API.Models.Reports;

namespace API.Interfaces
{
    public interface IReportGenerationService
    {
        Task<GeneratedReportFile> GenerateAsync(ReportGenerationRequest request, CancellationToken cancellationToken = default);
    }
}
