using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Entities;
using Microsoft.AspNetCore.Identity;

namespace API.Entities
{
  public class AppUser : IdentityUser<int>
  {


    public string PhotoUrl { get; set; }


  }
}
