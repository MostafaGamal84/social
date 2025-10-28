using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Api.Helpers;

public class PagedList<T> : List<T>
{
    private const int DefaultPageNumber = 1;
    private const int DefaultPageSize = 10;

    public PagedList(IEnumerable<T> items, int count, int pageNumber, int pageSize)
    {
        TotalCount = count;
        PageSize = pageSize;
        TotalPages = pageSize > 0 ? (int)Math.Ceiling(count / (double)pageSize) : 0;
        CurrentPage = TotalPages == 0 ? DefaultPageNumber : Math.Min(Math.Max(pageNumber, DefaultPageNumber), TotalPages);
        AddRange(items);
    }

    public int CurrentPage { get; }

    public int TotalPages { get; }

    public int PageSize { get; }

    public int TotalCount { get; }

    public static async Task<PagedList<T>> CreateAsync(IQueryable<T> source, int pageNumber, int pageSize)
    {
        var normalizedPageNumber = Math.Max(pageNumber, DefaultPageNumber);
        var normalizedPageSize = Math.Max(pageSize, DefaultPageSize);

        var count = await source.CountAsync();
        var totalPages = normalizedPageSize > 0 ? (int)Math.Ceiling(count / (double)normalizedPageSize) : 0;
        var effectivePageNumber = totalPages == 0 ? DefaultPageNumber : Math.Min(normalizedPageNumber, totalPages);

        var skip = (effectivePageNumber - 1) * normalizedPageSize;
        var items = await source.Skip(skip).Take(normalizedPageSize).ToListAsync();

        return new PagedList<T>(items, count, effectivePageNumber, normalizedPageSize);
    }
}
