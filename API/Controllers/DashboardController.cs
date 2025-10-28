
using API.DTOs;
using API.Error;
using API.Helpers.Enums;
using API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using UnitOfWork;

namespace API.Controllers
{
    [AllowAnonymous]
    public class DashboardController : BaseGenericApiController<Post, PostAddDto, PostReDto>
    {
        private readonly DataContext _context;
        public IUnitOfWork _uow { get; set; }
        private readonly IRepository<Post> _post;
        private readonly IRepository<Category> _category;
        public DashboardController(IUnitOfWork uow, DataContext context, IRepository<Post> post, IRepository<Category> category) : base(uow)
        {
            _uow = uow;

            _context = context;
            _post = post;
            _category = category;
        }
        [HttpPost("add")]
        public override async Task<IActionResult> Add([FromForm] PostAddDto dto)
        {
            dto.Id = 0;
            dto.ImageNum = dto.Image.Name;
            var x = _uow.Mapper.Map<Post>(dto);
            x.ImagePath = await _uow.FileRepository.CreateFileAsync(dto.Image, dto.ImageNum);

            var result = _post.Add(x);

            if (!await _uow.SaveAsync())
                return BadRequest(new ApiResponse(400));

            var map = _uow.Mapper.Map<PostReDto>(result);

            return Ok(map);
        }
        [HttpGet("GetPosts")]
        public virtual async Task<IActionResult> Get(
    [FromQuery] int? type,
    [FromQuery] DateTime? startDate,
    [FromQuery] DateTime? endDate)
        {
            // Start with the base query
            var query = _context.posts.Include(p => p.Category).AsQueryable();

            // Apply filters if present
            if (type != null)
            {
                query = query.Where(p => p.Type == type);
            }

            if (startDate.HasValue)
            {
                query = query.Where(p => p.CreatedAt >= startDate.Value); // Replace 'Date' with your actual post date field
            }

            if (endDate.HasValue)
            {
                query = query.Where(p => p.CreatedAt <= endDate.Value);
            }

            // Execute query
            var posts = await query.ToListAsync();

            int totalPostsCount = posts.Count;

            var typeCounts = posts
                .GroupBy(p => p.Type)
                .Select(g => new
                {
                    Type = g.Key,
                    Count = g.Count(),
                    Percentage = (double)g.Count() / totalPostsCount * 100
                })
                .ToList();

            var sentimentCounts = posts
                .GroupBy(p => p.Sentiment)
                .Select(g => new
                {
                    Sentiment = g.Key,
                    Count = g.Count(),
                    Percentage = (double)g.Count() / totalPostsCount * 100
                })
                .ToList();

            var categoryCounts = posts
                .GroupBy(p => p.Category.Name)
                .Select(g => new
                {
                    Category = g.Key,
                    Count = g.Count(),
                    Percentage = (double)g.Count() / totalPostsCount * 100
                })
                .ToList();

            var mapped = _uow.Mapper.Map<List<PostReDto>>(posts);

            return Ok(new
            {
                TotalPostsCount = totalPostsCount,
                TypeCounts = typeCounts,
                SentimentCounts = sentimentCounts,
                CategoryCounts = categoryCounts,
                Posts = mapped
            });
        }


        [HttpGet("GetCategory")]
        public virtual async Task<IActionResult> GetCategory()
        {
            var result = await _category.Map_GetAllByAsync<CategoryReturnDto>(x => x.IsDeleted == false && x.IsPermanentlyDeleted == false);

            return Ok(result);

        }
    }



}

