using System.Collections.Generic;
using API.DTOs;

namespace API.DTOs.Chat
{
    public class ChatInterpretationResponse
    {
        public bool Success { get; set; }
        public bool ShouldSearch { get; set; }
        public MediaIncidentQueryParams? Filters { get; set; }
        public string? Reply { get; set; }
        public string? Summary { get; set; }
        public List<string> Warnings { get; set; } = new();
        public List<string> Errors { get; set; } = new();
    }
}
