
using API.DTOs;
using API.Helpers.Enums;
using API.Migrations;
using AutoMapper;
using DTOs;
using Entities;


namespace API.Helpers
{

  public class AutoMapperProfiles : Profile
  {
    public AutoMapperProfiles()
    {
      CreateMap<BaseEntity, BaseDto>();
      CreateMap<PostAddDto, Post>();

      CreateMap<Post, PostReDto>()
       .ForMember(dest => dest.Sentiment,
           opt => opt.MapFrom(src => ((SentimentsEnum)src.Sentiment).ToString()))

                  .ForMember(dest => dest.Type,
                  opt => opt.MapFrom(src => ((TypeEnum)src.Type).ToString()));
      CreateMap<Category, CategoryReturnDto>();
      CreateMap<MediaIncidentView, MediaIncidentDto>()
        .ForMember(dest => dest.RepresentativeImageUrl, opt => opt.MapFrom(src => src.ImagePath));
      CreateMap<DateTime, DateTime>().ConvertUsing(x => DateTime.SpecifyKind(x, DateTimeKind.Utc));

    }
    private bool IsDefaultValue(object value)
    {
      if (value == null)
        return true;

      var type = value.GetType();

      // Handle strings separately
      if (type == typeof(string))
        return string.IsNullOrEmpty((string)value);

      // Handle other types (value types, classes)
      return value.Equals(Activator.CreateInstance(type));
    }

  }
}
