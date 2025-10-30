namespace API.Models.Reports
{
    public class GeneratedReportFile
    {
        public string FileName { get; set; } = "media-report.pptx";
        public string ContentType { get; set; } = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        public byte[] Content { get; set; } = System.Array.Empty<byte>();
    }
}
