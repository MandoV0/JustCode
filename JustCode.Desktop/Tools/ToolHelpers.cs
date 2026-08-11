using System.Text.Json;

public static class ToolHelpers
{
    /// <summary>
    /// Resolves a path relative to the current workspace and ensures that it does not escape the workspace directory.
    /// </summary>
    /// <param name="relativePath"> Path provided by the tool, relative to the workspace. </param>
    /// <param name="fullPath"> Resolved absolute path. </param>
    /// <param name="error"> Error result if path resolution fails. </param>
    /// <param name="checkExists"> Requires the file to exist? </param>
    /// <returns> True if the path was successfully resolved. </returns>
    public static bool TryResolvePath(string relativePath, out string fullPath, out ToolResult? error, bool checkExists = false)
    {
        fullPath = string.Empty;
        error = null;

        var workspace = Path.GetFullPath(Environment.CurrentDirectory);
        var full = Path.GetFullPath(Path.Combine(workspace, relativePath));

        var normalizedWorkspace = workspace + Path.DirectorySeparatorChar;
        if (!full.Equals(workspace, StringComparison.OrdinalIgnoreCase) &&
            !full.StartsWith(normalizedWorkspace, StringComparison.OrdinalIgnoreCase))
        {
            error = ToolResult.Error("Access outside of workspace is forbidden.");
            return false;
        }

        if (checkExists && !File.Exists(full))
        {
            error = ToolResult.Error($"File not found: {relativePath}");
            return false;
        }

        fullPath = full;
        return true;
    }
}