using System.Collections.Generic;

namespace API.Models.Reports
{
    public class ReportGenerationRequest
    {
        public string? Prompt { get; set; }
        public string? TemplateName { get; set; }
        public string? ReportTitle { get; set; }
        public string? Summary { get; set; }
        public IReadOnlyList<ReportSection> Sections { get; set; } = new List<ReportSection>();
    }
}
