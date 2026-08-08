namespace JustCode.Services;

/// <summary>
/// Cross platform app data directory:
/// Windows  %APPDATA%\JustCode
/// macOS    ~/Library/Application Support/JustCode
/// Linux    $XDG_DATA_HOME or ~/.local/share/JustCode
/// </summary>
internal sealed class AppDataService
{
    public string Root { get; }

    public AppDataService()
    {
        string baseDir = OperatingSystem.IsWindows()
            ? Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)
            : OperatingSystem.IsMacOS()
                ? Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Library",
                    "Application Support")
                : Environment.GetEnvironmentVariable("XDG_DATA_HOME") is { Length: > 0 } xdg
                    ? xdg
                    : Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                        ".local",
                        "share");

        Root = Path.Combine(baseDir, "JustCode");
        Directory.CreateDirectory(Root);
    }
}
