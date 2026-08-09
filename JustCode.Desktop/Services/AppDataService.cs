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
        Root = Path.Combine(ResolveBaseDir(), "JustCode");
        Directory.CreateDirectory(Root);
    }

    private static string ResolveBaseDir()
    {
        if (OperatingSystem.IsWindows())
            return Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);

        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

        if (OperatingSystem.IsMacOS())
            return Path.Combine(home, "Library", "Application Support");

        return Environment.GetEnvironmentVariable("XDG_DATA_HOME") is { Length: > 0 } xdg
            ? xdg
            : Path.Combine(home, ".local", "share");
    }
}