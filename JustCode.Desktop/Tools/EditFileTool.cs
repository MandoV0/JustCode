using System.Text.Json;
using JustCode.Services;

namespace JustCode.Tools;

public class EditFileTool : WorkspaceTool
{
    public EditFileTool(ProjectService project) : base(project) { }

    public override string Name => "edit";
    public override string Description => "Makes a precise text replacement in a file. old_string must match exactly (and uniquely, unless replace_all is set).";

    public override bool RequiresApproval => true;

    public override object ParameterSchema => new
    {
        type = "object",
        properties = new
        {
            path = new { type = "string", description = "Path to the file, relative to the workspace." },
            old_string = new { type = "string", description = "Exact text to replace. Must match exactly once unless replace_all is true." },
            new_string = new { type = "string", description = "Replacement text." },
            replace_all = new { type = "boolean", description = "Replace all occurrences instead of requiring a single match. Default false." }
        },
        required = new[] { "path", "old_string", "new_string" }
    };

    public override async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = arguments.GetProperty("path").GetString()!;
        var oldString = arguments.GetProperty("old_string").GetString()!;
        var newString = arguments.GetProperty("new_string").GetString()!;
        var replaceAll = arguments.TryGetProperty("replace_all", out var raEl) && raEl.GetBoolean();

        if (oldString.Length == 0)
        {
            return ToolResult.Error("old_string must not be empty. Use the write tool to create new files.");
        }

        if (ResolvePath(path, out var full, checkExists: true) is { } error)
        {
            return error;
        }

        return await ToolHelpers.GuardAsync("edit file", async () =>
        {
            using var fileLock = await ToolHelpers.LockFileAsync(full, cancellationToken);

            var file = await TextFileHelper.ReadAsync(full, cancellationToken);

            var lineEnding = file.LineEnding;
            var normalizedOriginal = file.Text.Replace("\r\n", "\n");
            var normalizedOld = oldString.Replace("\r\n", "\n");
            var normalizedNew = newString.Replace("\r\n", "\n");

            var occurrences = CountOccurrences(normalizedOriginal, normalizedOld);

            if (occurrences == 0)
            {
                return ToolResult.Error("old_string was not found in the file. Ensure it matches the file's current content exactly, including whitespace.");
            }

            if (occurrences > 1 && !replaceAll)
            {
                return ToolResult.Error($"old_string matches {occurrences} locations in the file. Provide more surrounding context to make it unique, or set replace_all to true.");
            }

            var updated = replaceAll
                ? normalizedOriginal.Replace(normalizedOld, normalizedNew)
                : ReplaceFirst(normalizedOriginal, normalizedOld, normalizedNew);

            var diff = TextDiff.Lines(normalizedOriginal, updated);

            updated = TextFileHelper.ConvertLineEndings(updated, lineEnding);

            await TextFileHelper.WriteAsync(full, updated, file.HasUtf8Bom, cancellationToken);

            return ToolResult.Ok(replaceAll
                ? $"Replaced {occurrences} occurrence(s) in {path}."
                : $"Applied edit to {path}.", diff);
        });
    }

    private static int CountOccurrences(string haystack, string needle)
    {
        int count = 0, index = 0;
        while ((index = haystack.IndexOf(needle, index, StringComparison.Ordinal)) != -1)
        {
            count++;
            index += needle.Length;
        }
        return count;
    }

    private static string ReplaceFirst(string haystack, string needle, string replacement)
    {
        var index = haystack.IndexOf(needle, StringComparison.Ordinal);
        return index == -1 ? haystack : haystack[..index] + replacement + haystack[(index + needle.Length)..];
    }
}