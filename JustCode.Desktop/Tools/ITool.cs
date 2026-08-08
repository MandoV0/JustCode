using System.Text.Json;

/// <summary>
/// Available Tool Interface for LLMs.
/// </summary>
public interface Tool
{
    string Name { get; }
    string Description { get; }
    object ParameterSchema { get; }

    Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken);

}