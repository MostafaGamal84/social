using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace API.DTOs.Reports
{
    public class ReportGenerationRequestDto
    {
        public string? Prompt { get; set; }

        public string? TemplateName { get; set; }

        public string? ReportTitle { get; set; }

        public string? Summary { get; set; }

        public IList<ReportSectionDto> Sections { get; set; } = new List<ReportSectionDto>();
    }
}
