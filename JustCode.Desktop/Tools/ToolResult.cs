namespace JustCode.Tools;

public sealed record DiffLine(string Type, string Text);

public sealed record ToolResult(bool Success, string Output, List<DiffLine>? Diff = null)
{
    public static ToolResult Ok(string output, List<DiffLine>? diff = null) => new(true, output, diff);
    public static ToolResult Error(string error) => new(false, error);
}
