using System.Collections.Generic;

namespace API.Models.Reports
{
    public class GeneratedReportContent
    {
        public string? Title { get; set; }
        public string? Summary { get; set; }
        public IReadOnlyList<ReportSection> Sections { get; set; } = new List<ReportSection>();
    }
}
