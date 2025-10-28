using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using API.DTOs;
using API.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers
{
    [AllowAnonymous]
    [ApiController]
    [Route("api/[controller]")]
    public class LookupController : ControllerBase
    {
        private readonly ILookupDataService _lookupDataService;

        public LookupController(ILookupDataService lookupDataService)
        {
            _lookupDataService = lookupDataService;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<LookupItemDto>>> GetLookupItems(CancellationToken cancellationToken)
        {
            var items = await _lookupDataService.GetLookupItemsAsync(cancellationToken).ConfigureAwait(false);
            return Ok(items);
        }
    }
}
