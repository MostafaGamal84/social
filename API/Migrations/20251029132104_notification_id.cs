using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace API.Migrations
{
    public partial class notification_id : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameTable(
                name: "IncidentNotification",
                schema: "dbo",
                newName: "IncidentNotifications",
                newSchema: "dbo");

            migrationBuilder.AddColumn<long>(
                name: "Id",
                schema: "dbo",
                table: "IncidentNotifications",
                type: "bigint",
                nullable: false,
                defaultValue: 0L)
                .Annotation("SqlServer:Identity", "1, 1");

            migrationBuilder.AddPrimaryKey(
                name: "PK_IncidentNotifications",
                schema: "dbo",
                table: "IncidentNotifications",
                column: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_IncidentNotifications",
                schema: "dbo",
                table: "IncidentNotifications");

            migrationBuilder.DropColumn(
                name: "Id",
                schema: "dbo",
                table: "IncidentNotifications");

            migrationBuilder.RenameTable(
                name: "IncidentNotifications",
                schema: "dbo",
                newName: "IncidentNotification",
                newSchema: "dbo");
        }
    }
}
