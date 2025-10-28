// /using System;
// using System.Collections.Generic;
// using System.Linq;
// using System.Threading.Tasks;
// using Microsoft.EntityFrameworkCore;

// namespace Api.Helpers
// {
//     public class PagedList<T> : List<T>
//     {
//         public PagedList(IEnumerable<T> items, int count, int pageNumber, int pageSize)
//         {
//             CurrentPage = pageNumber;
//             TotalPages = (int) Math.Ceiling(count / (double) pageSize);
//             PageSize = pageSize;
//             TotalCount = count;
//             AddRange(items);
//         }

//         public int CurrentPage { get; set; }
//         public int TotalPages { get; set; }
//         public int PageSize { get; set; }
//         public int TotalCount { get; set; }

//         public static async Task<PagedList<T>> CreateAsync(IQueryable<T> source, int pageNumber,
//             int pageSize)
//         {
//             var count =  source.Count();
//             var items =  source.Skip(pageNumber - 1).Take(pageSize).ToList();
//             return new PagedList<T>(items, count, pageNumber, pageSize);
//         }
//     }
// }
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

public class PagedList<T> : List<T>
{
    public PagedList(IEnumerable<T> items, int count, int pageNumber, int pageSize)
    {
        CurrentPage = pageNumber;
        TotalPages = (int)Math.Ceiling(count / (double)pageSize);
        PageSize = pageSize;
        TotalCount = count;
        AddRange(items);
    }

    // Current page number (1-based)
    public int CurrentPage { get; private set; }

    // Total number of pages
    public int TotalPages { get; private set; }

    // Number of items per page
    public int PageSize { get; private set; }

    // Total number of items in the source
    public int TotalCount { get; private set; }

    // Creates a paginated list asynchronously
    public static async Task<PagedList<T>> CreateAsync(IQueryable<T> source, int pageNumber, int pageSize)
    {
        // Count all items in the source
        var count = source.Count();

        // Skip and take for the requested page
        var items = source.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList();

        // Create a new paginated list
        return new PagedList<T>(items, count, pageNumber, pageSize);
    }
}
