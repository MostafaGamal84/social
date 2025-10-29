using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using API.DTOs;

namespace API.Interfaces
{
    public interface IIncidentAlertService
    {
        Task NotifyCriticalIncidentsAsync(IEnumerable<MediaIncidentDto> incidents, CancellationToken cancellationToken = default);
    }
}
