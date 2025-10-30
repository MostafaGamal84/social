using System.Collections.Generic;

namespace API.Models.Reports
{
    public class ReportSection
    {
        public string Title { get; set; } = string.Empty;
        public string? Body { get; set; }
        public IReadOnlyList<string> BulletPoints { get; set; } = new List<string>();
    }
}
