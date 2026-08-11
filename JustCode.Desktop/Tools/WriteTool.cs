using System.Text.Json;

namespace JustCode.Tools;

public class WriteTool : ITool
{
    public string Name => "write";
    public string Description => "Creates a new file or completely overwrites an existing file with the provided content. Parent directories are created if needed.";

    public object ParameterSchema => new
    {
        type = "object",
        properties = new
        {
            path = new { type = "string", description = "Path to the file, relative to the workspace." },
            content = new { type = "string", description = "Full content to write. Overwrites the entire file." }
        },
        required = new[] { "path", "content" }
    };

    public async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = arguments.GetProperty("path").GetString()!;
        var content = arguments.GetProperty("content").GetString() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(path))
        {
            return ToolResult.Error("path must not be empty.");
        }

        if (!ToolHelpers.TryResolvePath(path, out var full, out var error))
        {
            return error!;
        }

        var existed = File.Exists(full);

        try
        {
            var directory = Path.GetDirectoryName(full);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            await File.WriteAllTextAsync(full, content, cancellationToken);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            return ToolResult.Error($"Failed to write file: {ex.Message}");
        }

        return ToolResult.Ok(existed
            ? $"Overwrote {path} ({content.Length} character(s))."
            : $"Created {path} ({content.Length} character(s)).");
    }
}