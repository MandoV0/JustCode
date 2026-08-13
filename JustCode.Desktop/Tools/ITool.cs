using System.Text.Json;

namespace JustCode.Tools;

/// <summary>
/// Available Tool Interface for LLMs.
/// </summary>
public interface ITool
{
    string Name { get; }
    string Description { get; }
    object ParameterSchema { get; }

    bool RequiresApproval => false;

    Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken);
}