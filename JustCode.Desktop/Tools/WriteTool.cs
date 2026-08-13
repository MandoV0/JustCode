using System.Text.Json;
using JustCode.Services;

namespace JustCode.Tools;

public class WriteTool : WorkspaceTool
{
    public WriteTool(ProjectService project) : base(project) { }

    public override string Name => "write";
    public override string Description => "Creates a new file or completely overwrites an existing file with the provided content. Parent directories are created if needed.";

    public override bool RequiresApproval => true;

    public override object ParameterSchema => new
    {
        type = "object",
        properties = new
        {
            path = new { type = "string", description = "Path to the file, relative to the workspace." },
            content = new { type = "string", description = "Full content to write. Overwrites the entire file." }
        },
        required = new[] { "path", "content" }
    };

    public override async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = arguments.GetProperty("path").GetString()!;
        var content = arguments.GetProperty("content").GetString() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(path))
        {
            return ToolResult.Error("path must not be empty.");
        }

        if (ResolvePath(path, out var full) is { } error)
        {
            return error;
        }

        return await ToolHelpers.GuardAsync("write file", async () =>
        {
            using var fileLock = await ToolHelpers.LockFileAsync(full, cancellationToken);

            var existed = File.Exists(full);
            var text = content;
            var hasBom = existed
                ? await TextFileHelper.HasUtf8BomAsync(full, cancellationToken)
                : text.Length > 0 && text[0] == '\uFEFF';

            var diff = existed
                ? TextDiff.Lines((await TextFileHelper.ReadAsync(full, cancellationToken)).Text, text)
                : TextDiff.Lines(string.Empty, text);

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

            return ToolResult.Ok(existed
                ? $"Overwrote {path} ({content.Length} character(s))."
                : $"Created {path} ({content.Length} character(s)).", diff);
        });
    }
}