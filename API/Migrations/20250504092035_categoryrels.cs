using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace API.Migrations
{
    public partial class categoryrels : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Category",
                schema: "dbo",
                table: "posts");

            migrationBuilder.AddColumn<int>(
                name: "CategoryId",
                schema: "dbo",
                table: "posts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_posts_CategoryId",
                schema: "dbo",
                table: "posts",
                column: "CategoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_posts_categories_CategoryId",
                schema: "dbo",
                table: "posts",
                column: "CategoryId",
                principalSchema: "dbo",
                principalTable: "categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_posts_categories_CategoryId",
                schema: "dbo",
                table: "posts");

            migrationBuilder.DropIndex(
                name: "IX_posts_CategoryId",
                schema: "dbo",
                table: "posts");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                schema: "dbo",
                table: "posts");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                schema: "dbo",
                table: "posts",
                type: "nvarchar(max)",
                nullable: true);
        }
    }
}
