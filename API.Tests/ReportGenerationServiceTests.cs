using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using API.Helpers;
using API.Interfaces;
using API.Models.Reports;
using API.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace API.Tests
{
    public class ReportGenerationServiceTests
    {
        [Fact]
        public async Task GenerateAsync_InjectsProvidedSectionsIntoTemplate()
        {
            using var tempDirectory = new TemporaryDirectory();
            _ = CreateTemplate(tempDirectory.Path);
            var options = Options.Create(new ReportingOptions
            {
                TemplatePath = "templates/report_template.pptx",
                DefaultFileName = "default.pptx",
                MaxBulletPlaceholders = 3
            });

            var service = new ReportGenerationService(
                options,
                new FakeWebHostEnvironment(tempDirectory.Path),
                new StubAiReportContentService(),
                NullLogger<ReportGenerationService>.Instance);

            var request = new ReportGenerationRequest
            {
                ReportTitle = "Weekly Media Summary",
                Summary = "Summary",
                Sections = new[]
                {
                    new ReportSection
                    {
                        Title = "Highlights",
                        Body = "Key developments",
                        BulletPoints = new[] { "Item A", "Item B" }
                    }
                }
            };

            var result = await service.GenerateAsync(request, CancellationToken.None);

            Assert.Equal("Weekly Media Summary.pptx", result.FileName);

            using var archiveStream = new MemoryStream(result.Content);
            using var archive = new ZipArchive(archiveStream, ZipArchiveMode.Read);
            var slideEntry = archive.Entries.Single(e => e.FullName == "ppt/slides/slide1.xml");
            using var reader = new StreamReader(slideEntry.Open(), Encoding.UTF8);
            var slideContent = reader.ReadToEnd();

            Assert.Contains("Weekly Media Summary", slideContent);
            Assert.Contains("Highlights", slideContent);
            Assert.Contains("Key developments", slideContent);
            Assert.Contains("Item A", slideContent);
            Assert.Contains("Item B", slideContent);
        }

        [Fact]
        public async Task GenerateAsync_UsesAiContentWhenSectionsMissing()
        {
            using var tempDirectory = new TemporaryDirectory();
            _ = CreateTemplate(tempDirectory.Path);
            var options = Options.Create(new ReportingOptions
            {
                TemplatePath = "templates/report_template.pptx",
                DefaultFileName = "default.pptx",
                MaxBulletPlaceholders = 2
            });

            var aiService = new StubAiReportContentService(new GeneratedReportContent
            {
                Title = "AI Report",
                Summary = "Generated",
                Sections = new[]
                {
                    new ReportSection
                    {
                        Title = "Insights",
                        Body = "AI generated body",
                        BulletPoints = new[] { "AI Bullet" }
                    }
                }
            });

            var service = new ReportGenerationService(
                options,
                new FakeWebHostEnvironment(tempDirectory.Path),
                aiService,
                NullLogger<ReportGenerationService>.Instance);

            var request = new ReportGenerationRequest
            {
                Prompt = "Create a report"
            };

            var result = await service.GenerateAsync(request, CancellationToken.None);

            using var archiveStream = new MemoryStream(result.Content);
            using var archive = new ZipArchive(archiveStream, ZipArchiveMode.Read);
            var slideEntry = archive.Entries.Single(e => e.FullName == "ppt/slides/slide1.xml");
            using var reader = new StreamReader(slideEntry.Open(), Encoding.UTF8);
            var slideContent = reader.ReadToEnd();

            Assert.Contains("AI Report", slideContent);
            Assert.Contains("AI generated body", slideContent);
            Assert.Contains("AI Bullet", slideContent);
        }

        private static string CreateTemplate(string rootPath)
        {
            var templatesDirectory = Path.Combine(rootPath, "templates");
            Directory.CreateDirectory(templatesDirectory);
            var templatePath = Path.Combine(templatesDirectory, "report_template.pptx");

            using var fileStream = File.Create(templatePath);
            using (var archive = new ZipArchive(fileStream, ZipArchiveMode.Create, leaveOpen: true))
            {
                var slideEntry = archive.CreateEntry("ppt/slides/slide1.xml");
                using var writer = new StreamWriter(slideEntry.Open(), Encoding.UTF8);
                writer.Write("<p>{{REPORT_TITLE}} {{REPORT_SUMMARY}} {{SECTION_1_TITLE}} {{SECTION_1_BODY}} {{SECTION_1_BULLETS}} {{SECTION_1_BULLET_1}} {{GENERATED_ON}}</p>");
            }

            return templatePath;
        }

        private sealed class FakeWebHostEnvironment : IWebHostEnvironment
        {
            public FakeWebHostEnvironment(string contentRootPath)
            {
                ContentRootPath = contentRootPath;
            }

            public string ApplicationName { get; set; } = "TestHost";
            public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
            public string WebRootPath { get; set; } = string.Empty;
            public string EnvironmentName { get; set; } = "Development";
            public string ContentRootPath { get; set; }
            public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        }

        private sealed class StubAiReportContentService : IAiReportContentService
        {
            private readonly GeneratedReportContent _content;

            public StubAiReportContentService()
                : this(new GeneratedReportContent
                {
                    Title = "Stub Title",
                    Summary = "Stub Summary",
                    Sections = Array.Empty<ReportSection>()
                })
            {
            }

            public StubAiReportContentService(GeneratedReportContent content)
            {
                _content = content;
            }

            public Task<GeneratedReportContent> GenerateContentAsync(string prompt, CancellationToken cancellationToken = default)
            {
                return Task.FromResult(_content);
            }
        }

        private sealed class TemporaryDirectory : IDisposable
        {
            public TemporaryDirectory()
            {
                Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "report-tests-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(Path);
            }

            public string Path { get; }

            public void Dispose()
            {
                try
                {
                    if (Directory.Exists(Path))
                    {
                        Directory.Delete(Path, recursive: true);
                    }
                }
                catch
                {
                    // ignore cleanup failures in tests
                }
            }
        }
    }
}
