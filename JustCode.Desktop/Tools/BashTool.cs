using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using JustCode.Services;

namespace JustCode.Tools;

/// <summary>
/// Executes a shell command in the workspace and captures its standard output,
/// standard error, and exit code.
/// </summary>
public class BashTool : ITool
{
    private static readonly (Regex Pattern, string Reason)[] DenyPatterns =
    [
        (new Regex(@"rm\s+-[^\s]*r[^\s]*\s+/(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "recursive rm targeting the filesystem root"),
        (new Regex(@"rm\s+-[^\s]*r[^\s]*\s+/\*", RegexOptions.IgnoreCase | RegexOptions.Compiled), "recursive rm targeting the filesystem root"),
        (new Regex(@"rm\s+-[^\s]*r[^\s]*\s+--no-preserve-root(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "recursive rm with --no-preserve-root"),
        (new Regex(@"rm\s+-[^\s]*r[^\s]*\s+~(/|\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "recursive rm targeting the home directory"),
        (new Regex(@"rm\s+-[^\s]*r[^\s]*\s+%userprofile%(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "recursive rm targeting the user profile"),
        (new Regex(@"rm\s+-[^\s]*r[^\s]*\s+\$home(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "recursive rm targeting the home directory"),
        (new Regex(@"rm\s+-[^\s]*r[^\s]*\s+\$env:userprofile(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "recursive rm targeting the user profile"),
        (new Regex(@"\brd\s+(/[^\s]*[sq][^\s]*)\s+(/[^\s]*[sq][^\s]*)\s+[a-zA-Z]:\\(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "recursive deletion of a drive root"),
        (new Regex(@"\bdel\s+(/[^\s]*[sq][^\s]*)\s+(/[^\s]*[sq][^\s]*)\s+[a-zA-Z]:\\(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "recursive deletion of a drive root"),
        (new Regex(@"\bformat\s+[a-zA-Z]:(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "formatting a drive"),
        (new Regex(@"(^|[;&|])\s*deltree(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "deltree recursive deletion"),
        (new Regex(@"(^|[;&|])\s*diskpart(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "diskpart disk management"),
        (new Regex(@"(^|[;&|])\s*(shutdown|reboot|restart)(\s|$|[;&|])", RegexOptions.IgnoreCase | RegexOptions.Compiled), "system shutdown or reboot"),
        (new Regex(@"\bdd\s+if=/dev/zero\s+of=/dev/", RegexOptions.IgnoreCase | RegexOptions.Compiled), "dd zeroing a device"),
        (new Regex(@"\bmkfs\.[a-z0-9_]+\s+/dev/", RegexOptions.IgnoreCase | RegexOptions.Compiled), "mkfs formatting a device"),
        (new Regex(@":\s*\(\s*\)\s*\{", RegexOptions.Compiled), "fork bomb")
    ];

    private readonly ProjectService _project;

    public BashTool(ProjectService project) => _project = project;

    public string Name => "bash";
    public string Description => "Executes a shell command in the workspace and captures its standard output, standard error, and exit code. Useful for running dotnet builds/tests, git commands, and process automation.";

    public bool RequiresApproval => true;

    public object ParameterSchema => new
    {
        type = "object",
        properties = new
        {
            command = new { type = "string", description = "The shell command to execute. Required." },
            working_directory = new { type = "string", description = "Working directory for the command, relative to the workspace. Defaults to the workspace root." },
            timeout_seconds = new { type = "integer", description = "Maximum time in seconds to allow the command to run. Default 60, max 600." },
            capture_output = new { type = "boolean", description = "Whether to capture standard output/error. Default true." }
        },
        required = new[] { "command" }
    };

    public async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var command = arguments.GetProperty("command").GetString()!;
        if (string.IsNullOrWhiteSpace(command))
        {
            return ToolResult.Error("command must not be empty.");
        }

        var workingDirectory = arguments.TryGetProperty("working_directory", out var wdEl) ? wdEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(workingDirectory))
        {
            workingDirectory = _project.ResolveRoot();
        }
        else if (!_project.TryResolvePath(workingDirectory, out var resolvedWd, out var wdError))
        {
            return ToolResult.Error(wdError ?? "Path resolution failed.");
        }
        else
        {
            workingDirectory = resolvedWd;
        }

        if (!Directory.Exists(workingDirectory))
        {
            return ToolResult.Error($"Working directory not found: {workingDirectory}");
        }

        var timeoutSeconds = arguments.TryGetProperty("timeout_seconds", out var tsEl) && tsEl.ValueKind == JsonValueKind.Number
            ? tsEl.GetInt32()
            : 60;
        if (timeoutSeconds <= 0) timeoutSeconds = 60;
        if (timeoutSeconds > 600) timeoutSeconds = 600;

        var captureOutput = !arguments.TryGetProperty("capture_output", out var coEl) || coEl.GetBoolean();

        var denyReason = CheckDenyPatterns(command);
        if (denyReason is not null)
        {
            return ToolResult.Error($"Command blocked by JustCode safety rules: {denyReason}.");
        }

        var psi = new ProcessStartInfo
        {
            FileName = OperatingSystem.IsWindows()
                ? (Environment.GetEnvironmentVariable("COMSPEC") ?? "cmd.exe")
                : "/bin/bash",
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = captureOutput,
            RedirectStandardError = captureOutput,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        // ArgumentList quotes each argument correctly, so embedded quotes/newlines in the
        // command survive (unlike hand-built "-c \"...\"" strings).
        psi.ArgumentList.Add(OperatingSystem.IsWindows() ? "/c" : "-c");
        psi.ArgumentList.Add(command);

        using var process = new Process { StartInfo = psi };

        try
        {
            if (!process.Start())
            {
                return ToolResult.Error("Failed to start shell process.");
            }
        }
        catch (Exception ex)
        {
            return ToolResult.Error($"Failed to start shell process: {ex.Message}");
        }

        try
        {
            var stdoutTask = captureOutput ? process.StandardOutput.ReadToEndAsync(cancellationToken) : Task.FromResult(string.Empty);
            var stderrTask = captureOutput ? process.StandardError.ReadToEndAsync(cancellationToken) : Task.FromResult(string.Empty);

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));

            try
            {
                await process.WaitForExitAsync(timeoutCts.Token);
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(entireProcessTree: true); } catch { /* best effort */ }

                return ToolResult.Error(cancellationToken.IsCancellationRequested
                    ? "Command was cancelled."
                    : $"Command timed out after {timeoutSeconds} second(s) and was killed.");
            }

            var exitCode = process.ExitCode;
            var stdout = await stdoutTask;
            var stderr = await stderrTask;

            var output = BuildOutput(command, exitCode, stdout, stderr, captureOutput);
            return exitCode == 0 ? ToolResult.Ok(output) : ToolResult.Error(output);
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException)
        {
            return ToolResult.Error($"Failed to read command output: {ex.Message}");
        }
    }

    private static string? CheckDenyPatterns(string command)
    {
        foreach (var (pattern, reason) in DenyPatterns)
        {
            if (pattern.IsMatch(command))
                return reason;
        }

        return null;
    }

    private static string BuildOutput(string command, int exitCode, string stdout, string stderr, bool captureOutput)
    {
        if (!captureOutput)
        {
            return $"Command completed with exit code {exitCode}.";
        }

        var sb = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(stdout))
        {
            sb.AppendLine("--- stdout ---");
            sb.AppendLine(stdout.TrimEnd('\r', '\n'));
        }

        if (!string.IsNullOrWhiteSpace(stderr))
        {
            if (sb.Length > 0) sb.AppendLine();
            sb.AppendLine("--- stderr ---");
            sb.AppendLine(stderr.TrimEnd('\r', '\n'));
        }

        if (string.IsNullOrWhiteSpace(stdout) && string.IsNullOrWhiteSpace(stderr))
        {
            sb.AppendLine("(no output)");
        }

        sb.AppendLine();
        sb.Append($"exit code: {exitCode}");
        return sb.ToString();
    }
}
