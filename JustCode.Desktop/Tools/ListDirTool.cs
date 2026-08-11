using System.Text.Json;

namespace JustCode.Tools;

public class ListDirTool : ITool
{
    public string Name => "list_dir";

    public string Description => "Lists the content of a directory.";

    public object ParameterSchema => new
    {
        type = "object",
        properties = new
        {
            path = new
            {
                type = "string",
                description = "Path to the directory, relative to the workspace."
            }
        },
        required = new[] { "path" }
    };

    public async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = arguments.GetProperty("path").GetString()!;
        if (!ToolHelpers.TryResolvePath(path, out var full, out var error))
        {
            return error!;
        }

        if (!Directory.Exists(full))
        {
            return ToolResult.Error($"Directory not found: {path}");
        }

        try
        {
            var entries = Directory
                .EnumerateFileSystemEntries(full)
                .Select(path =>
                {
                    var name = Path.GetFileName(path);

                    return Directory.Exists(path)
                        ? $"{name}/" /* So model can differentiate between a file and a folder : file, folder/ */
                        : name;
                })
                .OrderBy(x => x, StringComparer.OrdinalIgnoreCase);

            return ToolResult.Ok(string.Join(Environment.NewLine, entries));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return ToolResult.Error($"Failed to list directory: {ex.Message}");
        }
    }
}