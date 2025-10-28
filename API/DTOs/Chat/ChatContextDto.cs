using System.Collections.Generic;

namespace API.DTOs.Chat
{
    public class ChatContextDto
    {
        public List<ChatLookupItemDto> Centers { get; set; } = new();
        public List<ChatLookupItemDto> Neighborhoods { get; set; } = new();
        public List<ChatLookupItemDto> Roads { get; set; } = new();
        public List<ChatLookupItemDto> Priorities { get; set; } = new();
        public List<ChatLookupItemDto> Statuses { get; set; } = new();
        public List<ChatLookupItemDto> SubCategories { get; set; } = new();
        public List<int> PageSizeOptions { get; set; } = new();
        public int? DefaultPageSize { get; set; }
    }
}
