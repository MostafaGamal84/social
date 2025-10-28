using API.DTOs;
using AutoMapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers
{
    [AllowAnonymous]
    [ApiController]
    [Route("api/media/incidents")]
    public class MediaIncidentsController : ControllerBase
    {
        private readonly DataContext _context;
        private readonly IMapper _mapper;

        public MediaIncidentsController(DataContext context, IMapper mapper)
        {
            _context = context;
            _mapper = mapper;
        }

        [HttpGet]
        public async Task<ActionResult> GetMediaIncidents([FromQuery] MediaIncidentQueryParams queryParams)
        {
            var incidentsQuery = _context.MediaIncidents.AsNoTracking();

            if (queryParams.CenterId.HasValue)
            {
                incidentsQuery = incidentsQuery.Where(i => i.CenterId == queryParams.CenterId.Value);
            }

            if (queryParams.NeighborhoodId.HasValue)
            {
                incidentsQuery = incidentsQuery.Where(i => i.NeighborhoodId == queryParams.NeighborhoodId.Value);
            }

            if (queryParams.RoadId.HasValue)
            {
                incidentsQuery = incidentsQuery.Where(i => i.RoadId == queryParams.RoadId.Value);
            }

            if (queryParams.StatusId.HasValue)
            {
                incidentsQuery = incidentsQuery.Where(i => i.StatusId == queryParams.StatusId.Value);
            }

            if (queryParams.PriorityId.HasValue)
            {
                incidentsQuery = incidentsQuery.Where(i => i.PriorityId == queryParams.PriorityId.Value);
            }

            if (!string.IsNullOrWhiteSpace(queryParams.Search))
            {
                var term = $"%{queryParams.Search.Trim()}%";
                incidentsQuery = incidentsQuery.Where(i =>
                    (!string.IsNullOrEmpty(i.RefId) && EF.Functions.Like(i.RefId!, term)) ||
                    (!string.IsNullOrEmpty(i.SubCategoryName) && EF.Functions.Like(i.SubCategoryName!, term)));
            }

            incidentsQuery = incidentsQuery
                .OrderByDescending(i => i.CreatedAt)
                .ThenByDescending(i => i.IncidentId);

            var pagedResult = await PagedList<MediaIncidentView>.CreateAsync(
                incidentsQuery,
                queryParams.PageNumber,
                queryParams.PageSize);

            var data = _mapper.Map<IEnumerable<MediaIncidentDto>>(pagedResult);

            var response = new
            {
                data,
                pagination = new
                {
                    currentPage = pagedResult.CurrentPage,
                    pageSize = pagedResult.PageSize,
                    totalCount = pagedResult.TotalCount,
                    totalPages = pagedResult.TotalPages
                }
            };

            return Ok(response);
        }
    }
}
