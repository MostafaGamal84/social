using API.Helpers;
using API.Interfaces;
using API.Repository;
using API.Services;
using UnitOfWork;


namespace API.Extensions
{
    public static class ApplicationServiceExtensions
    {
        public static IServiceCollection AddApplicationServices(this IServiceCollection services, IConfiguration config)
        {
            // services.AddScoped<ITokenService, TokenService>();
            services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
            services.AddScoped<IUnitOfWork, UnitOfWork.UnitOfWork>();
            services.AddAutoMapper(typeof(AutoMapperProfiles).Assembly);

            services.Configure<MailSettings>(config.GetSection("Mail"));

            services.AddScoped<ILookupDataService, LookupQueryService>();
            services.AddSingleton<IIncidentAlertService, IncidentAlertService>();
            services.AddTransient<IEmailSender, SmtpEmailSender>();
            services.AddScoped<IMediaIncidentDataService, MediaIncidentQueryService>();
            services.Configure<OpenAiOptions>(config.GetSection("OpenAI"));
            services.Configure<ReportingOptions>(config.GetSection("Reporting"));
            services.AddHttpClient<IChatAssistantService, ChatAssistantService>();
            services.AddHttpClient<IAiReportContentService, OpenAiReportContentService>();
            services.AddScoped<IReportGenerationService, ReportGenerationService>();

            services.AddDbContext<DataContext>(options =>
            {
                options.UseLazyLoadingProxies();
                options.UseSqlServer(config.GetConnectionString("DefaultConnection"));
            });
            return services;
        }
    }
}