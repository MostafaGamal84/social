using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using API.Helpers;
using API.Interfaces;
using API.Models.Reports;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API.Services
{
    public class ReportGenerationService : IReportGenerationService
    {
        private readonly ReportingOptions _options;
        private readonly IWebHostEnvironment _environment;
        private readonly IAiReportContentService _contentService;
        private readonly ILogger<ReportGenerationService> _logger;

        public ReportGenerationService(
            IOptions<ReportingOptions> options,
            IWebHostEnvironment environment,
            IAiReportContentService contentService,
            ILogger<ReportGenerationService> logger)
        {
            _options = options.Value;
            _environment = environment;
            _contentService = contentService;
            _logger = logger;
        }

        public async Task<GeneratedReportFile> GenerateAsync(ReportGenerationRequest request, CancellationToken cancellationToken = default)
        {
            if (request == null)
            {
                throw new ArgumentNullException(nameof(request));
            }

            var templatePath = ResolveTemplatePath(request.TemplateName);
            if (!File.Exists(templatePath))
            {
                throw new FileNotFoundException($"Report template not found at '{templatePath}'.", templatePath);
            }

            var sections = (request.Sections ?? Array.Empty<ReportSection>()).Where(s => s != null).ToList();
            GeneratedReportContent? generatedContent = null;

            if (sections.Count == 0 && !string.IsNullOrWhiteSpace(request.Prompt))
            {
                generatedContent = await _contentService.GenerateContentAsync(request.Prompt, cancellationToken).ConfigureAwait(false);
                sections = generatedContent.Sections?.ToList() ?? new List<ReportSection>();
            }

            if (sections.Count == 0)
            {
                throw new InvalidOperationException("No report sections were provided or generated.");
            }

            var reportTitle = request.ReportTitle
                ?? generatedContent?.Title
                ?? "تقرير الوسائط";

            var summary = request.Summary
                ?? generatedContent?.Summary
                ?? BuildDefaultSummary(sections);

            using var templateStream = File.OpenRead(templatePath);
            using var workingStream = new MemoryStream();
            await templateStream.CopyToAsync(workingStream, cancellationToken).ConfigureAwait(false);

            var tokens = BuildTokenMap(reportTitle, summary, sections);

            _logger.LogInformation("Generating report with {SectionCount} sections using template {Template}", sections.Count, templatePath);

            ApplyTokens(workingStream, tokens);

            var fileName = SanitizeFileName(reportTitle);
            if (string.IsNullOrWhiteSpace(fileName))
            {
                fileName = _options.DefaultFileName;
            }

            return new GeneratedReportFile
            {
                FileName = fileName,
                Content = workingStream.ToArray(),
                ContentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            };
        }

        private string ResolveTemplatePath(string? templateName)
        {
            var templatePath = string.IsNullOrWhiteSpace(templateName)
                ? _options.TemplatePath
                : Path.Combine(Path.GetDirectoryName(_options.TemplatePath) ?? string.Empty, templateName);

            if (!Path.IsPathRooted(templatePath))
            {
                templatePath = Path.Combine(_environment.ContentRootPath, templatePath);
            }

            return templatePath;
        }

        private static string BuildDefaultSummary(IEnumerable<ReportSection> sections)
        {
            var importantSentences = sections
                .SelectMany(section => new[] { section.Title, section.Body }.Concat(section.BulletPoints ?? Array.Empty<string>()))
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Take(3);

            return string.Join(" • ", importantSentences);
        }

        private IDictionary<string, string> BuildTokenMap(string title, string summary, IReadOnlyList<ReportSection> sections)
        {
            var tokens = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["{{REPORT_TITLE}}"] = title,
                ["{{REPORT_SUMMARY}}"] = summary,
                ["{{GENERATED_ON}}"] = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm 'UTC'")
            };

            for (var index = 0; index < sections.Count; index++)
            {
                var section = sections[index];
                var prefix = $"{{SECTION_{index + 1}_";
                tokens[$"{prefix}TITLE}}"] = section.Title ?? string.Empty;
                tokens[$"{prefix}BODY}}"] = section.Body ?? string.Empty;

                var bulletList = section.BulletPoints?.Where(b => !string.IsNullOrWhiteSpace(b)).ToList() ?? new List<string>();
                tokens[$"{prefix}BULLETS}}"] = bulletList.Count > 0 ? string.Join(Environment.NewLine, bulletList) : string.Empty;

                var maxBullets = Math.Max(_options.MaxBulletPlaceholders, bulletList.Count);
                for (var bulletIndex = 0; bulletIndex < maxBullets; bulletIndex++)
                {
                    var tokenKey = $"{prefix}BULLET_{bulletIndex + 1}}}";
                    tokens[tokenKey] = bulletIndex < bulletList.Count ? bulletList[bulletIndex] : string.Empty;
                }
            }

            return tokens;
        }

        private void ApplyTokens(MemoryStream presentationStream, IDictionary<string, string> tokens)
        {
            presentationStream.Position = 0;

            using (var archive = new ZipArchive(presentationStream, ZipArchiveMode.Update, leaveOpen: true))
            {
                var slideNames = archive.Entries
                    .Where(entry => entry.FullName.StartsWith("ppt/slides/slide", StringComparison.OrdinalIgnoreCase))
                    .Select(entry => entry.FullName)
                    .ToList();

                foreach (var slideName in slideNames)
                {
                    var entry = archive.GetEntry(slideName);
                    if (entry == null)
                    {
                        continue;
                    }

                    string originalContent;
                    using (var entryStream = entry.Open())
                    using (var reader = new StreamReader(entryStream, Encoding.UTF8, leaveOpen: true))
                    {
                        originalContent = reader.ReadToEnd();
                    }

                    var updatedContent = ReplaceTokens(originalContent, tokens);

                    entry.Delete();
                    var replacementEntry = archive.CreateEntry(slideName);
                    using var replacementStream = replacementEntry.Open();
                    using var writer = new StreamWriter(replacementStream, Encoding.UTF8);
                    writer.Write(updatedContent);
                }
            }

            presentationStream.Position = 0;
        }

        private static string ReplaceTokens(string content, IDictionary<string, string> tokens)
        {
            var updated = content;
            foreach (var token in tokens)
            {
                updated = updated.Replace(token.Key, token.Value ?? string.Empty, StringComparison.Ordinal);
            }

            return updated;
        }

        private static string SanitizeFileName(string title)
        {
            var invalidChars = Path.GetInvalidFileNameChars();
            var cleaned = new string(title.Where(ch => !invalidChars.Contains(ch)).ToArray());
            cleaned = cleaned.Trim();
            if (string.IsNullOrWhiteSpace(cleaned))
            {
                return string.Empty;
            }

            if (!cleaned.EndsWith(".pptx", StringComparison.OrdinalIgnoreCase))
            {
                cleaned += ".pptx";
            }

            return cleaned;
        }
    }
}
