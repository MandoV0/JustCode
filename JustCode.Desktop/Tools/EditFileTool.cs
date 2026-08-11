using System.Text.Json;

namespace JustCode.Tools;

public class EditFileTool : ITool
{
    public string Name => "edit";
    public string Description => "Makes a precise text replacement in a file. old_string must match exactly (and uniquely, unless replace_all is set).";

    public object ParameterSchema => new
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

    public async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = arguments.GetProperty("path").GetString()!;
        var oldString = arguments.GetProperty("old_string").GetString()!;
        var newString = arguments.GetProperty("new_string").GetString()!;
        var replaceAll = arguments.TryGetProperty("replace_all", out var raEl) && raEl.GetBoolean();

        if (oldString.Length == 0)
        {
            return ToolResult.Error("old_string must not be empty. Use the write tool to create new files.");
        }

        if (!ToolHelpers.TryResolvePath(path, out var full, out var error, checkExists: true))
        {
            return error!;
        }

        string original;
        try
        {
            original = await File.ReadAllTextAsync(full, cancellationToken);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return ToolResult.Error($"Failed to read file: {ex.Message}");
        }

        var lineEnding = original.Contains('\r') ? "\r\n" : "\n";
        var normalizedOriginal = original.Replace("\r\n", "\n");
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

        if (lineEnding == "\r\n")
        {
            updated = updated.Replace("\n", "\r\n");
        }

        try
        {
            await File.WriteAllTextAsync(full, updated, cancellationToken);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return ToolResult.Error($"Failed to write file: {ex.Message}");
        }

        return ToolResult.Ok(replaceAll
            ? $"Replaced {occurrences} occurrence(s) in {path}."
            : $"Applied edit to {path}.");
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