using System.Text.Json;
using JustCode.Services;

namespace JustCode.Tools;

public class ListDirTool : ITool
{
    private readonly ProjectService _project;

    public ListDirTool(ProjectService project) => _project = project;

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
        if (!_project.TryResolvePath(path, out var full, out var error))
        {
            return ToolResult.Error(error ?? "Path resolution failed.");
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