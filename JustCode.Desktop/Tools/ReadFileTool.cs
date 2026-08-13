using System.Text;
using System.Text.Json;
using JustCode.Services;

namespace JustCode.Tools;

public class ReadFileTool : ITool
{
    private readonly ProjectService _project;

    public ReadFileTool(ProjectService project) => _project = project;

    public string Name => "read";
    public string Description =>
        "Reads a file relative to the workspace. Supports slicing with startLine/endLine, " +
        "prefixes lines with their numbers, detects binary files, and truncates huge or long-line content.";

    public object ParameterSchema => new
    {
        type = "object",
        properties = new
        {
            path = new
            {
                type = "string",
                description = "Path to the file, relative to the workspace.",
            },
            startLine = new
            {
                type = "integer",
                description = "First line to read, inclusive. Defaults to 1.",
            },
            endLine = new
            {
                type = "integer",
                description = "Last line to read, inclusive. Defaults to startLine + 500.",
            },
            lineNumbers = new
            {
                type = "boolean",
                description = "Prefix each line with its 1-based number. Defaults to true.",
            },
        },
        required = new[] { "path" },
    };

    private const int MaxLines = 500;
    private const int MaxChars = 30_000;
    private const long MaxFileBytes = 50L * 1024 * 1024;
    private const int MaxLineChars = 2_000;
    private const int BinaryProbeBytes = 1_024;

    public async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var path = arguments.GetProperty("path").GetString()!;

        if (!_project.TryResolvePath(path, out var full, out var error, checkExists: true))
        {
            return ToolResult.Error(error ?? "Path resolution failed.");
        }

        var startLine = arguments.TryGetProperty("startLine", out var startEl) && startEl.ValueKind == JsonValueKind.Number
            ? startEl.GetInt32()
            : 1;
        var endLine = arguments.TryGetProperty("endLine", out var endEl) && endEl.ValueKind == JsonValueKind.Number
            ? endEl.GetInt32()
            : startLine + MaxLines;
        var lineNumbers = !arguments.TryGetProperty("lineNumbers", out var lnEl) || lnEl.ValueKind != JsonValueKind.False;

        if (startLine < 1) return ToolResult.Error("startLine must be at least 1.");
        if (endLine < startLine) return ToolResult.Error("endLine must be greater than or equal to startLine.");

        byte[] bytes;
        try
        {
            var info = new FileInfo(full);
            if (info.Length > MaxFileBytes)
            {
                return ToolResult.Error(
                    $"File is {info.Length / (1024.0 * 1024.0):F1} MB which exceeds the {MaxFileBytes / (1024 * 1024)} MB limit. " +
                    "Use startLine/endLine to read a specific slice instead.");
            }

            bytes = await File.ReadAllBytesAsync(full, cancellationToken);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return ToolResult.Error($"Failed to read file: {ex.Message}");
        }

        var probe = Math.Min(bytes.Length, BinaryProbeBytes);
        for (var i = 0; i < probe; i++)
        {
            if (bytes[i] == 0)
            {
                return ToolResult.Error($"Binary file detected: {path} ({bytes.Length:N0} bytes). Cannot display as text.");
            }
        }

        string text;
        if (TextFileHelper.HasUtf8Bom(bytes))
        {
            text = Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
        }
        else
        {
            text = Encoding.UTF8.GetString(bytes);
        }

        var lines = text.Split('\n');
        var totalLines = lines.Length;
        var width = totalLines.ToString().Length;

        var builder = new StringBuilder(MaxChars);
        var to = Math.Min(endLine, totalLines);
        var truncated = false;
        var lineTruncated = false;

        for (var i = startLine - 1; i < to; i++)
        {
            var line = lines[i];
            if (line.EndsWith('\r')) line = line[..^1];

            if (line.Length > MaxLineChars)
            {
                line = line[..MaxLineChars] + " …(line truncated)";
                lineTruncated = true;
            }

            if (lineNumbers)
            {
                var number = (i + 1).ToString();
                builder.Append(number).Append(' ', width - number.Length + 1);
            }
            builder.AppendLine(line);

            if (builder.Length > MaxChars)
            {
                builder.Length = MaxChars;
                truncated = true;
                break;
            }
        }

        var header = $"File: {path} — {totalLines:N0} lines, {bytes.Length / 1024.0:F1} KB";
        if (truncated) header += " (output truncated, use a smaller slice)";

        var body = builder.ToString().TrimEnd('\r', '\n');
        if (lineTruncated) body += "\n…(some lines were truncated)";

        return ToolResult.Ok($"{header}\n{body}");
    }
}
