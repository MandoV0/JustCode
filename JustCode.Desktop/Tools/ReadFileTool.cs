using System.Text.Json;

namespace JustCode.Tools;

public class ReadFileTool : ITool
{
    public string Name => "read";
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
        var path = arguments.GetProperty("path").GetString()!;
        if (!ToolHelpers.TryResolvePath(path, out var full, out var error, checkExists: true))
        {
            return error!;
        }

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