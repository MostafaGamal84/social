namespace API.Helpers
{
    public class OpenAiOptions
    {
        public string? ApiKey { get; set; }
        public string Model { get; set; } = "gpt-4o-mini";
        public string Endpoint { get; set; } = "https://api.openai.com/v1/chat/completions";
        public string? Organization { get; set; }
        public string? Project { get; set; }
    }
}
