using System.Text.Json;
using JustCode.Services;

namespace JustCode.Tools;

public class ListDirTool : WorkspaceTool
{
    public ListDirTool(ProjectService project) : base(project) { }

    public override string Name => "list_dir";

    public override string Description => "Lists the content of a directory.";

    public override object ParameterSchema => new
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

    public override async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = arguments.GetProperty("path").GetString()!;

        if (ResolvePath(path, out var full) is { } error)
        {
            return error;
        }

        if (!Directory.Exists(full))
        {
            return ToolResult.Error($"Directory not found: {path}");
        }

        return await ToolHelpers.GuardAsync("list directory", () =>
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

            return Task.FromResult(ToolResult.Ok(string.Join(Environment.NewLine, entries)));
        });
    }
}