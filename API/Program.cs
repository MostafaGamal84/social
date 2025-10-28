

using Hangfire;

internal class Program
{
  private static async Task Main(string[] args)
  {
    var builder = WebApplication.CreateBuilder(args);
    builder.Services.AddApplicationServices(builder.Configuration);
    builder.Services.AddIdentityServices(builder.Configuration);
    // builder.Services.AddHangfire(x => x.UseSqlServerStorage(builder.Configuration.GetConnectionString("DefaultConnection")));
    // builder.Services.AddHangfireServer();

    builder.Services.AddControllers();
    builder.Services.AddSpaStaticFiles(configuration =>
                {
                  configuration.RootPath = "wwwroot";
                });
    builder.Services.AddControllersWithViews();
    builder.Services.AddSwaggerGen(c =>
    {
      c.SwaggerDoc("v1", new OpenApiInfo { Title = "SocialDashboard", Version = "v1" });
    });

    var app = builder.Build();
    app.UseDeveloperExceptionPage();
    app.UseSwagger();

    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "API v1"));


    app.UseHttpsRedirection();
    app.UseRouting();
    app.UseCors(x => x.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin());
    app.UseAuthentication();
    app.UseAuthorization();
    // app.UseHangfireDashboard(pathMatch:"/HangFireDashboard");
    app.MapControllers();
    app.UseDefaultFiles();
    app.UseStaticFiles();




    using var scope = app.Services.CreateScope();
    var services = scope.ServiceProvider;
    try
    {
      var context = services.GetRequiredService<DataContext>();
      await context.Database.MigrateAsync();
      await Seed.SeedUsers(context);
    }
    catch (Exception ex)
    {
      var logger = services.GetRequiredService<ILogger<Program>>();
      logger.LogError(ex, "An error occured During migration");

    }
    await app.RunAsync();
  }
}
