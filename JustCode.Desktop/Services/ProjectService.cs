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
    private readonly string _projectsPath;
    private readonly string _activePath;

    private List<Project> _projects = [];
    private string? _activeId;

    public ProjectService()
    {
        var root = Path.Combine(AppPaths.AppDataBase, "JustCode");
        _projectsPath = Path.Combine(root, "projects.json");
        _activePath = Path.Combine(root, "active-project.json");
        Load();
    }

    public string Root =>
        ActiveProject is { Path.Length: > 0 } project
            ? Path.GetFullPath(project.Path)
            : Path.GetFullPath(Environment.CurrentDirectory);

    public IReadOnlyList<Project> List() => _projects;

    public string? ActiveId => _activeId;

    public Project? ActiveProject =>
        _activeId is null ? null : _projects.FirstOrDefault(p => p.Id == _activeId);

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

        var root = Root;
        var full = Path.GetFullPath(Path.Combine(root, path));

        var normalizedRoot = root + Path.DirectorySeparatorChar;
        if (!full.Equals(root, StringComparison.OrdinalIgnoreCase) &&
            !full.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase))
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
