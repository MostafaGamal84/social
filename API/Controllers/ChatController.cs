using System.Threading;
using System.Threading.Tasks;
using API.DTOs.Chat;
using API.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChatController : ControllerBase
    {
        private readonly IChatAssistantService _chatAssistantService;

        public ChatController(IChatAssistantService chatAssistantService)
        {
            _chatAssistantService = chatAssistantService;
        }

        [HttpPost("interpret")]
        public async Task<ActionResult<ChatInterpretationResponse>> Interpret([FromBody] ChatInterpretationRequest request, CancellationToken cancellationToken)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var result = await _chatAssistantService.InterpretAsync(request, cancellationToken);
            return Ok(result);
        }
    }
}
