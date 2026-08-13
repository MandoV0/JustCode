using JustCode.Infrastructure;

namespace JustCode.Services;

/// <summary>
/// Cross platform app data directory for JustCode:
/// Windows  %APPDATA%\JustCode
/// macOS    ~/Library/Application Support/JustCode
/// Linux    $XDG_DATA_HOME or ~/.local/share/JustCode
/// </summary>
internal sealed class AppDataService
{
    public string Root { get; }

    public AppDataService()
    {
        Root = Path.Combine(AppPaths.AppDataBase, "JustCode");
        Directory.CreateDirectory(Root);
    }
}
