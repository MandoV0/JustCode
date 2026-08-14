using System.Text.Json;
using System.Text.RegularExpressions;
using JustCode.Services;

namespace JustCode.Tools;

public class SearchTool : WorkspaceTool
{
    public SearchTool(ProjectService project) : base(project) { }

    private const long MaxSearchFileBytes = 10L * 1024 * 1024;
    private const int BinaryProbeBytes = 1024;

    private static readonly HashSet<string> ExcludedDirectoryNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "node_modules", ".git", ".hg", ".svn", "bin", "obj", "dist", "build", ".build",
        "out", "target", "vendor", ".venv", "venv", "__pycache__", ".next", ".nuxt",
        "coverage", ".cache", ".idea", ".vscode", ".vs", "tmp", "logs", "Pods",
        ".terraform", "bower_components", "packages"
    };

    public override string Name => "search";
    public override string Description => "Searches file contents for a text pattern or regular expression, returning matching files and lines (grep-style).";

    public override object ParameterSchema => new
    {
        type = "object",
        properties = new
        {
            pattern = new { type = "string", description = "Text or regular expression to search for. Required." },
            path = new { type = "string", description = "Directory to search, relative to the workspace. Defaults to the workspace root." },
            file_pattern = new { type = "string", description = "Filename glob filter (e.g. *.cs). Defaults to * (all files)." },
            case_sensitive = new { type = "boolean", description = "Whether matches are case sensitive. Default false." },
            use_regex = new { type = "boolean", description = "Treat pattern as a regular expression. Default false." },
            max_results = new { type = "integer", description = "Maximum number of matches to return. Default 100." },
            show_lines = new { type = "boolean", description = "Include matching line content in results. Default true." }
        },
        required = new[] { "pattern" }
    };

    public override async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var pattern = arguments.GetProperty("pattern").GetString()!;
        if (string.IsNullOrWhiteSpace(pattern))
        {
            return ToolResult.Error("pattern must not be empty.");
        }

        var searchPath = arguments.TryGetProperty("path", out var pathEl) ? pathEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(searchPath))
        {
            searchPath = ".";
        }

        var filePattern = arguments.TryGetProperty("file_pattern", out var fpEl) ? fpEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(filePattern))
        {
            filePattern = "*";
        }

        var caseSensitive = arguments.TryGetProperty("case_sensitive", out var csEl) && csEl.GetBoolean();
        var useRegex = arguments.TryGetProperty("use_regex", out var urEl) && urEl.GetBoolean();
        var maxResults = arguments.TryGetProperty("max_results", out var mrEl) && mrEl.ValueKind == JsonValueKind.Number
            ? mrEl.GetInt32()
            : 100;
        var showLines = !arguments.TryGetProperty("show_lines", out var slEl) || slEl.GetBoolean();

        if (maxResults <= 0)
        {
            return ToolResult.Error("max_results must be greater than 0.");
        }

        if (ResolvePath(searchPath, out var root) is { } error)
        {
            return error;
        }

        if (!Directory.Exists(root))
        {
            return ToolResult.Error($"Directory not found: {searchPath}");
        }

        Regex? regex = null;
        if (useRegex)
        {
            try
            {
                var options = (caseSensitive ? RegexOptions.None : RegexOptions.IgnoreCase) | RegexOptions.Compiled;
                regex = new Regex(pattern, options, TimeSpan.FromSeconds(2));
            }
            catch (ArgumentException ex)
            {
                return ToolResult.Error($"Invalid regular expression: {ex.Message}");
            }
        }

        var comparison = caseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;
        var results = new List<string>();
        var filesSearched = 0;
        var truncated = false;

        return await ToolHelpers.GuardAsync("search", async () =>
        {
            try
            {
                foreach (var file in Directory.EnumerateFiles(root, filePattern, SearchOption.AllDirectories))
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    if (IsExcluded(root, file)) continue;
                    filesSearched++;

                    try
                    {
                        if (new FileInfo(file).Length > MaxSearchFileBytes)
                        {
                            continue; // Skip files too large to read safely.
                        }

                        if (await IsBinaryAsync(file, cancellationToken))
                        {
                            continue; // Skip binary files.
                        }
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                    {
                        continue;
                    }

                    string content;
                    try
                    {
                        content = await File.ReadAllTextAsync(file, cancellationToken);
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or NotSupportedException)
                    {
                        continue; // Skip files we cannot read.
                    }

                    foreach (var (line, number) in EnumerateLines(content))
                    {
                        var isMatch = regex is not null
                            ? regex.IsMatch(line)
                            : line.Contains(pattern, comparison);

                        if (!isMatch)
                        {
                            continue;
                        }

                        var relative = Path.GetRelativePath(Project.Root, file);
                        results.Add(showLines
                            ? $"{relative}:{number}: {Truncate(line)}"
                            : $"{relative}:{number}");

                        if (results.Count >= maxResults)
                        {
                            truncated = true;
                            break;
                        }
                    }

                    if (truncated)
                    {
                        break;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                return ToolResult.Error("Search was cancelled.");
            }

            var output = results.Count == 0
                ? "No matches found."
                : string.Join(Environment.NewLine, results);

            if (truncated)
            {
                output += $"{Environment.NewLine}... truncated at {maxResults} result(s).";
            }

            output += $"{Environment.NewLine}[{results.Count} match(es) across {filesSearched} file(s)]";

            return ToolResult.Ok(output);
        });
    }

    private static bool IsExcluded(string root, string file)
    {
        var relative = Path.GetRelativePath(root, file);
        foreach (var segment in relative.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
        {
            if (ExcludedDirectoryNames.Contains(segment))
                return true;
        }
        return false;
    }

    private static IEnumerable<(string Text, int Number)> EnumerateLines(string content)
    {
        var start = 0;
        var number = 0;
        for (var i = 0; i <= content.Length; i++)
        {
            if (i == content.Length || content[i] == '\n')
            {
                number++;
                var line = content[start..i];
                if (line.EndsWith('\r'))
                {
                    line = line[..^1];
                }
                yield return (line, number);
                start = i + 1;
            }
        }
    }

    private static string Truncate(string line, int maxLength = 500)
    {
        return line.Length <= maxLength ? line : line[..maxLength] + "...";
    }

    private static async Task<bool> IsBinaryAsync(string file, CancellationToken cancellationToken)
    {
        using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        var probe = new byte[BinaryProbeBytes];
        var read = await stream.ReadAsync(probe.AsMemory(0, BinaryProbeBytes), cancellationToken);
        for (var i = 0; i < read; i++)
        {
            if (probe[i] == 0) return true;
        }
        return false;
    }
}