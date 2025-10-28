using System.Threading;
using System.Threading.Tasks;
using Api.Helpers;
using API.DTOs;

namespace API.Interfaces
{
    public interface IMediaIncidentDataService
    {
        Task<PagedList<MediaIncidentDto>> GetMediaIncidentsAsync(MediaIncidentQueryParams queryParams, CancellationToken cancellationToken = default);
    }
}
