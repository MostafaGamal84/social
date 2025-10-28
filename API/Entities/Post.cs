using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Entities;

namespace API.Entities
{
    public class Post : BaseEntity
    {
        public string ImageNum { get; set; }
        public string ContentCreatorName { get; set; }
        public int Sentiment { get; set; }
        public string Neighborhood { get; set; }
        public int Type { get; set; }
        public DateTime CreatedAt { get; set; }
        public string ImagePath { get; set; }
        public int Order { get; set; }
        public int CategoryId { get; set; }
        public virtual Category Category { get; set; }
    }

}