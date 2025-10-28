using System.Threading;
using System.Threading.Tasks;
using API.DTOs.Chat;

namespace API.Interfaces
{
    public interface IChatAssistantService
    {
        Task<ChatInterpretationResponse> InterpretAsync(ChatInterpretationRequest request, CancellationToken cancellationToken = default);
    }
}
