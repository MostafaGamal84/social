namespace API.Entities
{
    public class MediaIncidentView
    {
        public int IncidentId { get; set; }
        public string? RefId { get; set; }
        public int? SubCategoryId { get; set; }
        public string? SubCategoryName { get; set; }
        public decimal? QuantityValue { get; set; }
        public int? PriorityId { get; set; }
        public string? PriorityName { get; set; }
        public string? PriorityColor { get; set; }
        public int? CenterId { get; set; }
        public string? CenterName { get; set; }
        public int? NeighborhoodId { get; set; }
        public string? NeighborhoodName { get; set; }
        public int? RoadId { get; set; }
        public string? RoadName { get; set; }
        public int? StatusId { get; set; }
        public string? StatusName { get; set; }
        public DateTime CreatedAt { get; set; }
        public string? ImagePath { get; set; }
        public double? Lat { get; set; }
        public double? Lng { get; set; }
    }
}
