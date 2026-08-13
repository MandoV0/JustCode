using System.Text.Json;
using JustCode.Services;

namespace JustCode.Tools;

/// <summary>
/// Base for tools that operate on filesystem paths inside the workspace.
/// Provides the shared project dependency, path resolution, and the default
/// approval requirement so individual tools only implement their own logic.
/// </summary>
public abstract class WorkspaceTool : ITool
{
    protected readonly ProjectService Project;

    protected WorkspaceTool(ProjectService project) => Project = project;

    public abstract string Name { get; }
    public abstract string Description { get; }
    public abstract object ParameterSchema { get; }
    public abstract Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken);

    public virtual bool RequiresApproval => false;

    /// <summary>
    /// Resolves a workspace-relative path. Returns an error result when the path
    /// cannot be resolved, or null when <paramref name="fullPath"/> was set.
    /// </summary>
    protected ToolResult? ResolvePath(string path, out string fullPath, bool checkExists = false)
    {
        fullPath = string.Empty;
        if (Project.TryResolvePath(path, out var resolved, out var error, checkExists))
        {
            fullPath = resolved;
            return null;
        }
        return ToolResult.Error(error ?? "Path resolution failed.");
    }
}
