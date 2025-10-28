



using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace API.Data
{
  public class DataContext : IdentityDbContext<AppUser, AppRole, int,
   IdentityUserClaim<int>, AppUserRole, IdentityUserLogin<int>,
   IdentityRoleClaim<int>, IdentityUserToken<int>>
  {
    public DataContext(DbContextOptions options) : base(options)
    {


    }
    public DbSet<Post> posts { get; set; }
    public DbSet<Category> categories { get; set; }
    public DbSet<MediaIncidentView> MediaIncidents => Set<MediaIncidentView>();
    protected override void OnModelCreating(ModelBuilder builder)
    {
      builder.HasDefaultSchema("dbo");

      base.OnModelCreating(builder);
       builder.Entity<Category>()
      .HasMany(ur => ur.Posts)
      .WithOne(u => u.Category)
      .HasForeignKey(ur => ur.CategoryId)
      .IsRequired();

      builder.Entity<MediaIncidentView>(e =>
      {
        e.HasNoKey();
        e.ToView("vw_MediaMonitoringIncidents");
      });

    }
    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
      optionsBuilder.UseLazyLoadingProxies();
      optionsBuilder
.ConfigureWarnings(x => x.Ignore(RelationalEventId.MultipleCollectionIncludeWarning));
    }


  }
}
