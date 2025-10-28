



using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace API.Data
{
  public class DataContext 
  {
    public DataContext(DbContextOptions options) : base(options)
    {


    }
    public DbSet<Post> posts { get; set; }
    public DbSet<Category> categories { get; set; }
    protected override void OnModelCreating(ModelBuilder builder)
    {
      builder.HasDefaultSchema("dbo");

      base.OnModelCreating(builder);
       builder.Entity<Category>()
      .HasMany(ur => ur.Posts)
      .WithOne(u => u.Category)
      .HasForeignKey(ur => ur.CategoryId)
      .IsRequired();

    }
    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
      optionsBuilder.UseLazyLoadingProxies();
      optionsBuilder
.ConfigureWarnings(x => x.Ignore(RelationalEventId.MultipleCollectionIncludeWarning));
    }


  }
}
