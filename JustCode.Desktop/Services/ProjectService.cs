using System.Text.Json;
using JustCode.Infrastructure;

namespace JustCode.Services;

/// <summary>A user-created project: a name and a filesystem path the agent operates on.</summary>
public sealed class Project
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
}

/// <summary>
/// Owns the set of projects (persisted to projects.json) and the active project.
/// <see cref="Root"/> is the active project's path, falling back to the process
/// working directory when no project exists yet. Tools resolve paths against
/// <see cref="Root"/> at execution time, so switching the active project changes
/// where every tool operates.
/// </summary>
public sealed class ProjectService
{
    /// <summary>
    /// Per-agent workspace root, scoped to the current agent's async execution flow.
    /// Lets concurrent agents on different projects run without stomping each other's
    /// root, and lets a chat with no project avoid a stale native active project.
    /// Falls back to the global active-project root when unset.
    /// </summary>
    private static readonly AsyncLocal<string?> ScopedRoot = new();

    public static string? ScopedWorkspaceRoot
    {
        get => ScopedRoot.Value;
        set => ScopedRoot.Value = value;
    }

    private readonly string _projectsPath;
    private readonly string _activePath;

    private List<Project> _projects = [];
    private string? _activeId;

    public ProjectService(AppDataService appData)
    {
        _projectsPath = Path.Combine(appData.Root, "projects.json");
        _activePath = Path.Combine(appData.Root, "active-project.json");
        Load();
    }

    public string Root
    {
        get
        {
            var root = ActiveProject is { Path.Length: > 0 } project
                ? Path.GetFullPath(project.Path)
                : Path.GetFullPath(Environment.CurrentDirectory);

            return root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
    }

    public IReadOnlyList<Project> List() => _projects;

    public string? ActiveId => _activeId;

    public Project? ActiveProject =>
        _activeId is null ? null : _projects.FirstOrDefault(p => p.Id == _activeId);

    public Project? Get(string id) => _projects.FirstOrDefault(p => p.Id == id);

    /// <summary>The workspace root for the current agent flow, falling back to the global root.</summary>
    public string ResolveRoot() =>
        !string.IsNullOrWhiteSpace(ScopedWorkspaceRoot)
            ? ScopedWorkspaceRoot!
            : Root;

    public void Save(Project project)
    {
        var index = _projects.FindIndex(p => p.Id == project.Id);
        if (index >= 0)
        {
            _projects[index] = project;
        }
        else
        {
            _projects.Add(project);
            _activeId ??= project.Id;
        }

        Persist();
    }

    public void Delete(string id)
    {
        _projects.RemoveAll(p => p.Id == id);
        if (_activeId == id) _activeId = null;
        Persist();
    }

    public void SetActive(string id)
    {
        if (_projects.Any(p => p.Id == id) && _activeId != id)
        {
            _activeId = id;
            Persist();
        }
    }

    /// <summary>
    /// Resolves a path relative to the project root and ensures it stays inside it.
    /// Absolute paths are allowed when they point within the project.
    /// </summary>
    /// <param name="path"> Path provided by the tool. </param>
    /// <param name="fullPath"> Resolved absolute path on success. </param>
    /// <param name="error"> User-facing error message on failure. </param>
    /// <param name="checkExists"> Requires the file to exist? </param>
    /// <returns> True if the path was successfully resolved. </returns>
    public bool TryResolvePath(string path, out string fullPath, out string? error, bool checkExists = false)
    {
        fullPath = string.Empty;
        error = null;

        var root = ResolveRoot();
        var candidate = (path ?? string.Empty).Trim().Trim('"');
        if (candidate.Length == 0)
        {
            error = "Path must not be empty.";
            return false;
        }

        string full;
        if (OperatingSystem.IsWindows())
        {
            // Windows: drive-qualified paths (C:\..., C:/...) are absolute; everything else is
            // workspace-relative. Strip leading separators so "/README.md" or "\README.md"
            // does not resolve to the current drive root.
            full = IsDriveQualified(candidate)
                ? Path.GetFullPath(candidate)
                : Path.GetFullPath(Path.Combine(
                    root,
                    candidate.TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)));
        }
        else
        {
            // Unix: Path.Combine already keeps rooted paths (leading '/') absolute and
            // joins everything else to the workspace root.
            full = Path.GetFullPath(Path.Combine(root, candidate));
        }

        if (!IsWithin(full, root))
        {
            error = "Access outside of workspace is forbidden.";
            return false;
        }

        if (checkExists && !File.Exists(full))
        {
            error = $"File not found: {path}";
            return false;
        }

        fullPath = full;
        return true;
    }

    private static bool IsDriveQualified(string path) =>
        path.Length >= 2 && char.IsLetter(path[0]) && path[1] == ':';

    private static bool IsWithin(string full, string root)
    {
        var normalizedRoot = root + Path.DirectorySeparatorChar;
        return full.Equals(root, StringComparison.OrdinalIgnoreCase)
            || full.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase);
    }

    private void Load()
    {
        try
        {
            if (File.Exists(_projectsPath))
            {
                _projects = JsonSerializer.Deserialize<List<Project>>(File.ReadAllText(_projectsPath), Json.Options) ?? [];
            }

            if (File.Exists(_activePath))
            {
                var active = File.ReadAllText(_activePath).Trim();
                if (_projects.Any(p => p.Id == active)) _activeId = active;
            }
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Failed to load projects: {ex.Message}");
        }
    }

    private void Persist()
    {
        try
        {
            File.WriteAllText(_projectsPath, JsonSerializer.Serialize(_projects, Json.Options));
            File.WriteAllText(_activePath, _activeId ?? string.Empty);
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Failed to save projects: {ex.Message}");
        }
    }
}
