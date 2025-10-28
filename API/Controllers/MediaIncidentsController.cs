using System.Threading;
using Api.Helpers;
using API.DTOs;
using API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers
{
    [AllowAnonymous]
    [ApiController]
    [Route("api/media/incidents")]
    public class MediaIncidentsController : ControllerBase
    {
        private readonly IMediaIncidentDataService _mediaIncidentDataService;

        public MediaIncidentsController(IMediaIncidentDataService mediaIncidentDataService)
        {
            _mediaIncidentDataService = mediaIncidentDataService;
        }

        [HttpGet]
        public async Task<ActionResult> GetMediaIncidents([FromQuery] MediaIncidentQueryParams queryParams, CancellationToken cancellationToken)
        {
            var pagedResult = await _mediaIncidentDataService.GetMediaIncidentsAsync(queryParams, cancellationToken);

            var response = new
            {
                data = pagedResult,
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
