using System;
using System.Collections.Generic;
using System.Data;
using System.Threading;
using System.Threading.Tasks;
using Api.Helpers;
using API.DTOs;
using API.Interfaces;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace API.Services
{
    public class MediaIncidentQueryService : IMediaIncidentDataService
    {
        private const string ViewName = "vw_MediaMonitoringIncidents";

        private readonly string _connectionString;
        private readonly ILogger<MediaIncidentQueryService> _logger;

        public MediaIncidentQueryService(IConfiguration configuration, ILogger<MediaIncidentQueryService> logger)
        {
            _connectionString = configuration.GetConnectionString("MediaIncidentConnection")
                ?? throw new InvalidOperationException("Connection string 'MediaIncidentConnection' is not configured.");
            _logger = logger;
        }

        public async Task<PagedList<MediaIncidentDto>> GetMediaIncidentsAsync(MediaIncidentQueryParams queryParams, CancellationToken cancellationToken = default)
        {
            if (queryParams == null)
            {
                throw new ArgumentNullException(nameof(queryParams));
            }

            try
            {
                var filterParameters = BuildFilterParameters(queryParams, out var whereClause);

                await using var connection = new SqlConnection(_connectionString);
                await connection.OpenAsync(cancellationToken).ConfigureAwait(false);

                var totalCount = await ExecuteCountAsync(connection, whereClause, filterParameters, cancellationToken).ConfigureAwait(false);

                if (totalCount == 0)
                {
                    return new PagedList<MediaIncidentDto>(Array.Empty<MediaIncidentDto>(), 0, queryParams.PageNumber, queryParams.PageSize);
                }

                var items = await ExecuteQueryAsync(connection, whereClause, filterParameters, queryParams, cancellationToken).ConfigureAwait(false);

                return new PagedList<MediaIncidentDto>(items, totalCount, queryParams.PageNumber, queryParams.PageSize);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to retrieve media incidents from {ViewName}.", ViewName);
                throw;
            }
        }

        private static async Task<int> ExecuteCountAsync(SqlConnection connection, string whereClause, IReadOnlyCollection<SqlParameter> filterParameters, CancellationToken cancellationToken)
        {
            var sql = $"SELECT COUNT(*) FROM {ViewName} {whereClause}";

            await using var command = new SqlCommand(sql, connection);
            foreach (var parameter in filterParameters)
            {
                command.Parameters.Add(CloneParameter(parameter));
            }

            var result = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            return Convert.ToInt32(result);
        }

        private static async Task<IReadOnlyList<MediaIncidentDto>> ExecuteQueryAsync(SqlConnection connection, string whereClause, IReadOnlyCollection<SqlParameter> filterParameters, MediaIncidentQueryParams queryParams, CancellationToken cancellationToken)
        {
            var pageNumber = Math.Max(queryParams.PageNumber, 1);
            var pageSize = Math.Max(queryParams.PageSize, 1);
            var offset = (pageNumber - 1) * pageSize;

            var sql = $@"
SELECT IncidentId,
       RefId,
       MainCategoryId,
       MainCategoryName,
       SubCategoryId,
       SubCategoryName,
       Quantity AS QuantityValue,
       PriorityId,
       PriorityName,
       PriorityColor,
       CenterId,
       CenterName,
       NeighborhoodId,
       NeighborhoodName,
       RoadId,
       RoadName,
       StatusId,
       StatusArabicName,
       StatusEnglishName,
       StatusColor,
       SourceOfIncident,
       RepresentativeImagePath AS ImagePath,
       CreatedAt,
       Lat,
       Lng
FROM {ViewName}
{whereClause}
ORDER BY CreatedAt DESC, IncidentId DESC
OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY";

            await using var command = new SqlCommand(sql, connection);
            foreach (var parameter in filterParameters)
            {
                command.Parameters.Add(CloneParameter(parameter));
            }

            command.Parameters.Add(new SqlParameter("@Offset", SqlDbType.Int) { Value = offset });
            command.Parameters.Add(new SqlParameter("@PageSize", SqlDbType.Int) { Value = pageSize });

            await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);

            var incidents = new List<MediaIncidentDto>();
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                incidents.Add(MapIncident(reader));
            }

            return incidents;
        }

        private static List<SqlParameter> BuildFilterParameters(MediaIncidentQueryParams queryParams, out string whereClause)
        {
            var filters = new List<string>();
            var parameters = new List<SqlParameter>();

            if (queryParams.CenterId.HasValue)
            {
                filters.Add("[CenterId] = @CenterId");
                parameters.Add(new SqlParameter("@CenterId", SqlDbType.Int) { Value = queryParams.CenterId.Value });
            }

            if (queryParams.NeighborhoodId.HasValue)
            {
                filters.Add("[NeighborhoodId] = @NeighborhoodId");
                parameters.Add(new SqlParameter("@NeighborhoodId", SqlDbType.Int) { Value = queryParams.NeighborhoodId.Value });
            }

            if (queryParams.RoadId.HasValue)
            {
                filters.Add("[RoadId] = @RoadId");
                parameters.Add(new SqlParameter("@RoadId", SqlDbType.Int) { Value = queryParams.RoadId.Value });
            }

            if (queryParams.SubCategoryId.HasValue)
            {
                filters.Add("[SubCategoryId] = @SubCategoryId");
                parameters.Add(new SqlParameter("@SubCategoryId", SqlDbType.Int) { Value = queryParams.SubCategoryId.Value });
            }

            if (queryParams.StatusId.HasValue)
            {
                filters.Add("[StatusId] = @StatusId");
                parameters.Add(new SqlParameter("@StatusId", SqlDbType.Int) { Value = queryParams.StatusId.Value });
            }

            if (queryParams.PriorityId.HasValue)
            {
                filters.Add("[PriorityId] = @PriorityId");
                parameters.Add(new SqlParameter("@PriorityId", SqlDbType.Int) { Value = queryParams.PriorityId.Value });
            }

            if (!string.IsNullOrWhiteSpace(queryParams.Search))
            {
                filters.Add("((RefId IS NOT NULL AND RefId LIKE @Search) OR (SubCategoryName IS NOT NULL AND SubCategoryName LIKE @Search))");
                parameters.Add(new SqlParameter("@Search", SqlDbType.NVarChar, 255)
                {
                    Value = $"%{queryParams.Search.Trim()}%"
                });
            }

            whereClause = filters.Count > 0 ? $"WHERE {string.Join(" AND ", filters)}" : string.Empty;
            return parameters;
        }

        private static MediaIncidentDto MapIncident(SqlDataReader reader)
        {
            var statusArabic = GetNullableString(reader, "StatusArabicName");
            var statusEnglish = GetNullableString(reader, "StatusEnglishName");

            return new MediaIncidentDto
            {
                IncidentId = reader.GetInt32(reader.GetOrdinal("IncidentId")),
                RefId = GetNullableString(reader, "RefId"),
                MainCategoryId = GetNullableInt(reader, "MainCategoryId"),
                MainCategoryName = GetNullableString(reader, "MainCategoryName"),
                SubCategoryId = GetNullableInt(reader, "SubCategoryId"),
                SubCategoryName = GetNullableString(reader, "SubCategoryName"),
                QuantityValue = GetNullableDecimal(reader, "QuantityValue"),
                PriorityId = GetNullableInt(reader, "PriorityId"),
                PriorityName = GetNullableString(reader, "PriorityName"),
                PriorityColor = GetNullableString(reader, "PriorityColor"),
                CenterId = GetNullableInt(reader, "CenterId"),
                CenterName = GetNullableString(reader, "CenterName"),
                NeighborhoodId = GetNullableInt(reader, "NeighborhoodId"),
                NeighborhoodName = GetNullableString(reader, "NeighborhoodName"),
                RoadId = GetNullableInt(reader, "RoadId"),
                RoadName = GetNullableString(reader, "RoadName"),
                StatusId = GetNullableInt(reader, "StatusId"),
                StatusArabicName = statusArabic,
                StatusEnglishName = statusEnglish,
                StatusName = statusArabic ?? statusEnglish,
                StatusColor = GetNullableString(reader, "StatusColor"),
                SourceOfIncident = GetNullableString(reader, "SourceOfIncident"),
                RepresentativeImageUrl = GetNullableString(reader, "ImagePath"),
                CreatedAt = DateTime.SpecifyKind(reader.GetDateTime(reader.GetOrdinal("CreatedAt")), DateTimeKind.Utc),
                Lat = GetNullableDouble(reader, "Lat"),
                Lng = GetNullableDouble(reader, "Lng")
            };
        }

        private static SqlParameter CloneParameter(SqlParameter source)
        {
            return new SqlParameter(source.ParameterName, source.SqlDbType)
            {
                Value = source.Value,
                Size = source.Size,
                Precision = source.Precision,
                Scale = source.Scale,
                IsNullable = source.IsNullable
            };
        }

        private static int? GetNullableInt(SqlDataReader reader, string columnName)
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
        }

        private static decimal? GetNullableDecimal(SqlDataReader reader, string columnName)
        {
            var ordinal = reader.GetOrdinal(columnName);
            if (reader.IsDBNull(ordinal))
            {
                return null;
            }

            var value = reader.GetValue(ordinal);
            return value switch
            {
                decimal dec => dec,
                double dbl => (decimal)dbl,
                float fl => (decimal)fl,
                long l => l,
                int i => i,
                short s => s,
                byte b => b,
                _ => Convert.ToDecimal(value)
            };
        }

       private static string? GetNullableString(SqlDataReader reader, string columnName)
{
    var ordinal = reader.GetOrdinal(columnName);
    if (reader.IsDBNull(ordinal)) return null;

    var value = reader.GetValue(ordinal);

    // حوّل أي نوع إلى string بأمان
    return value switch
    {
        string s   => s,
        char c     => c.ToString(),
        int i      => i.ToString(),
        long l     => l.ToString(),
        short sh   => sh.ToString(),
        byte b     => b.ToString(),
        bool bo    => bo ? "1" : "0",
        decimal d  => d.ToString(System.Globalization.CultureInfo.InvariantCulture),
        double db  => db.ToString(System.Globalization.CultureInfo.InvariantCulture),
        float f    => f.ToString(System.Globalization.CultureInfo.InvariantCulture),
        DateTime dt=> dt.ToString("yyyy-MM-dd HH:mm:ss"),
        byte[] arr => Convert.ToBase64String(arr),
        _          => value.ToString()
    };
}
        private static double? GetNullableDouble(SqlDataReader reader, string columnName)
        {
            var ordinal = reader.GetOrdinal(columnName);
            if (reader.IsDBNull(ordinal))
            {
                return null;
            }

            var value = reader.GetValue(ordinal);
            return value switch
            {
                double d => d,
                float f => f,
                decimal dec => (double)dec,
                _ => Convert.ToDouble(value)
            };
        }
    }
}
