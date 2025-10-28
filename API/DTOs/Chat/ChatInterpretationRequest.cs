using System.Collections.Generic;

namespace API.DTOs.Chat
{
    public class ChatInterpretationRequest
    {
        public List<ChatMessageDto> Messages { get; set; } = new();
        public ChatContextDto Context { get; set; } = new();
    }
}
