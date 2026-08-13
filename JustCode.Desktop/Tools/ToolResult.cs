namespace JustCode.Tools;

public sealed record ToolResult(bool Success, string Output)
{
    public static ToolResult Ok(string output) => new(true, output);
    public static ToolResult Error(string error) => new(false, error);
}