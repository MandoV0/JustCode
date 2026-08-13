using System.Text.Json;
using JustCode.Services;

namespace JustCode.Tools;

public class WriteTool : ITool
{
    private readonly ProjectService _project;

    public WriteTool(ProjectService project) => _project = project;

    public string Name => "write";
    public string Description => "Creates a new file or completely overwrites an existing file with the provided content. Parent directories are created if needed.";

    public bool RequiresApproval => true;

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

        if (!_project.TryResolvePath(path, out var full, out var error))
        {
            return ToolResult.Error(error ?? "Path resolution failed.");
        }

        using var fileLock = await ToolHelpers.LockFileAsync(full, cancellationToken);

        var existed = File.Exists(full);

        try
        {
            var text = content;
            var hasBom = existed
                ? await TextFileHelper.HasUtf8BomAsync(full, cancellationToken)
                : text.Length > 0 && text[0] == '\uFEFF';

            if (!existed && hasBom)
            {
                text = text[1..];
            }

            var directory = Path.GetDirectoryName(full);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            await TextFileHelper.WriteAsync(full, text, hasBom, cancellationToken);
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