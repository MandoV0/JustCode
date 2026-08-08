namespace JustCode.Infrastructure;

/// <summary>
/// Writes to %LOCALAPPDATA%\JustCode\debug.log (Windows) / ~/Library/Logs/JustCode (macOS) / ~/.local/share/JustCode (Linux).
/// </summary>
internal static class DebugLog
{
    private static readonly object Sync = new();

    public static string LogPath
    {
        get
        {
            if (OperatingSystem.IsWindows())
            {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JustCode", "debug.log");
            }
            if (OperatingSystem.IsMacOS())
            {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Library", "Logs", "JustCode", "debug.log");
            }
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            return Path.Combine(home, ".local", "share", "JustCode", "debug.log");
        }
    }

    public static void Write(string message)
    {
        try
        {
            lock (Sync)
            {
                var path = LogPath;
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                File.AppendAllText(path, $"{DateTime.Now:HH:mm:ss.fff} [{Environment.CurrentManagedThreadId}] {message}{Environment.NewLine}");
            }
        }
        catch
        {
        }
    }
}
