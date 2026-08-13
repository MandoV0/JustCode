namespace JustCode.Infrastructure;

/// <summary>
/// Cross platform base directories for app data and local logs.
/// Windows  %APPDATA% / %LOCALAPPDATA%
/// macOS    ~/Library/Application Support / ~/Library/Logs
/// Linux    $XDG_DATA_HOME or ~/.local/share
/// </summary>
internal static class AppPaths
{
    public static string AppDataBase
    {
        get
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

    public static string LocalDataBase
    {
        get
        {
            if (OperatingSystem.IsWindows())
                return Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

            if (OperatingSystem.IsMacOS())
                return Path.Combine(home, "Library", "Logs");

            return Path.Combine(home, ".local", "share");
        }
    }
}
