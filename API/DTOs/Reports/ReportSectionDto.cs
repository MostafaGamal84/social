using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace API.DTOs.Reports
{
    public class ReportSectionDto
    {
        [Required]
        public string Title { get; set; } = string.Empty;

        public string? Body { get; set; }

        public IList<string> BulletPoints { get; set; } = new List<string>();
    }
}
