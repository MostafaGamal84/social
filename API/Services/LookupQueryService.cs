using System;
using System.Collections.Generic;
using System.Data;
using System.Threading;
using System.Threading.Tasks;
using API.DTOs;
using API.Interfaces;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace API.Services
{
    public class LookupQueryService : ILookupDataService
    {
        private const string ViewName = "dbo.vw_Lookup";

        private readonly string _connectionString;
        private readonly ILogger<LookupQueryService> _logger;

        public LookupQueryService(IConfiguration configuration, ILogger<LookupQueryService> logger)
        {
            _connectionString = configuration.GetConnectionString("MediaIncidentConnection")
                ?? throw new InvalidOperationException("Connection string 'MediaIncidentConnection' is not configured.");
            _logger = logger;
        }

        public async Task<IReadOnlyList<LookupItemDto>> GetLookupItemsAsync(CancellationToken cancellationToken = default)
        {
            try
            {
                await using var connection = new SqlConnection(_connectionString);
                await connection.OpenAsync(cancellationToken).ConfigureAwait(false);

                var sql = $@"SELECT LookupType, LookupId, LookupName, ParentId, IsDeleted FROM {ViewName} WHERE ISNULL(IsDeleted, 0) = 0";

                await using var command = new SqlCommand(sql, connection);

                var items = new List<LookupItemDto>();
                await using var reader = await command.ExecuteReaderAsync(CommandBehavior.CloseConnection, cancellationToken).ConfigureAwait(false);

                while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
                {
                    items.Add(new LookupItemDto
                    {
                        LookupType = reader.GetString(reader.GetOrdinal("LookupType")),
                        LookupId = reader.GetInt32(reader.GetOrdinal("LookupId")),
                        LookupName = GetNullableString(reader, "LookupName"),
                        ParentId = GetNullableInt(reader, "ParentId"),
                        IsDeleted = GetBoolean(reader, "IsDeleted")
                    });
                }

                return items;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to retrieve lookup data from {ViewName}.", ViewName);
                throw;
            }
        }

        private static string? GetNullableString(SqlDataReader reader, string columnName)
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
        }

        private static int? GetNullableInt(SqlDataReader reader, string columnName)
        {
            var ordinal = reader.GetOrdinal(columnName);
            return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
        }

        private static bool GetBoolean(SqlDataReader reader, string columnName)
        {
            var ordinal = reader.GetOrdinal(columnName);
            if (reader.IsDBNull(ordinal))
            {
                return false;
            }

            var value = reader.GetValue(ordinal);
            return value switch
            {
                bool boolean => boolean,
                byte b => b != 0,
                short s => s != 0,
                int i => i != 0,
                _ => Convert.ToBoolean(value)
            };
        }
    }
}
