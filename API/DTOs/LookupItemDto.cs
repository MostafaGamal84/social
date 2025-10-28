namespace API.DTOs
{
    public class LookupItemDto
    {
        public string LookupType { get; set; } = string.Empty;
        public int LookupId { get; set; }
        public string? LookupName { get; set; }
        public int? ParentId { get; set; }
        public bool IsDeleted { get; set; }
    }
}
