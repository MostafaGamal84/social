using System;

namespace API.Entities
{
    public class IncidentNotification
    {
         public long Id { get; set; } 
        public int IncidentId { get; set; }

        public DateTime CreatedAtUtc { get; set; }

        public DateTime? SentAtUtc { get; set; }
    }
}
