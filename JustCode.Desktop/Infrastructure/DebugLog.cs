namespace JustCode.Infrastructure;

/// <summary>
/// Writes to %LOCALAPPDATA%\JustCode\debug.log (Windows) / ~/Library/Logs/JustCode (macOS) / ~/.local/share/JustCode (Linux).
/// </summary>
internal static class DebugLog
{
    private static readonly object Sync = new();

    public static string LogPath =>
        Path.Combine(AppPaths.LocalDataBase, "JustCode", "debug.log");

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
