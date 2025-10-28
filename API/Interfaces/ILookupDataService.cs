using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using API.DTOs;

namespace API.Interfaces
{
    public interface ILookupDataService
    {
        Task<IReadOnlyList<LookupItemDto>> GetLookupItemsAsync(CancellationToken cancellationToken = default);
    }
}
