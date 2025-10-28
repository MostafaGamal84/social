using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using DTOs;

namespace API.DTOs
{
    public class PostReDto :BaseDto
    {
         public string ImageNum { get; set; }
        public string ContentCreatorName { get; set; }
        public string Sentiment { get; set; }
        public string Neighborhood { get; set; }
        public string Type { get; set; }
        public DateTime CreatedAt { get; set; }
        public string ImagePath { get; set; }
        public int Order { get; set; }
        public int CategoryId { get; set; }
        public virtual CategoryReturnDto Category { get; set; }
    }
}