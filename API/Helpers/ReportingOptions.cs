namespace API.Helpers
{
    public class ReportingOptions
    {
        public string TemplatePath { get; set; } = "templates/report_template.pptx";
        public string DefaultFileName { get; set; } = "media-report.pptx";
        public int MaxBulletPlaceholders { get; set; } = 5;
    }
}
