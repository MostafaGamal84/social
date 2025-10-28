using Api.Helpers;

namespace API.DTOs
{
    public class MediaIncidentQueryParams : PaginationParams
    {
        public int? CenterId { get; set; }
        public int? NeighborhoodId { get; set; }
        public int? RoadId { get; set; }
        public int? StatusId { get; set; }
        public int? PriorityId { get; set; }
        public string? Search { get; set; }
    }
}
