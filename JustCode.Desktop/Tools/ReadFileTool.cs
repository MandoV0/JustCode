using System.Text.Json;

namespace JustCode.Tools;

public class ReadFileTool : ITool
{
    public string Name => "read_file";
    public string Description => "Reads the content of a file relative to the workspace.";

    public object ParameterSchema => new
    {
        type = "object",
        properties = new
        {
            path = new
            {
                type = "string",
                description = "Path to the file, relative to the workspace."
            }
        },
        required = new[] { "path" }
    };

    public async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var rel = arguments.TryGetProperty("path", out var p) ? p.GetString() : null;
        if (string.IsNullOrWhiteSpace(rel))
            return ToolResult.Error("'path' argument is required.");

        var workspace = Path.GetFullPath(Environment.CurrentDirectory);
        var full = Path.GetFullPath(Path.Combine(workspace, rel));

        if (!full.StartsWith(workspace + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            return ToolResult.Error("Access outside of workspace is forbidden.");

        if (!File.Exists(full))
            return ToolResult.Error($"File not found: {rel}");

        try
        {
            return ToolResult.Ok(await File.ReadAllTextAsync(full, cancellationToken));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return ToolResult.Error($"Failed to read file: {ex.Message}");
        }
    }
}