using System.Text.Json;
using JustCode.Infrastructure;
using JustCode.Tools;

namespace JustCode.Services;

public sealed record ChatTurn(string Role, string Text, string? Reasoning = null, List<JsonElement>? Blocks = null);

public sealed record ToolStatus(string Name, string Arguments, string State, string? Output = null, string? CallId = null, bool Success = true, List<DiffLine>? Diff = null);

public abstract class LlmProviderService(List<ITool> tools, PermissionService? permissions = null)
{
    protected static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(120) };
    protected readonly Dictionary<string, ITool> Tools = tools.ToDictionary(t => t.Name);
    protected readonly PermissionService? Permissions = permissions;

    public string? ThinkingEffort { get; set; }

    public string? AgentId { get; set; }

    public abstract IAsyncEnumerable<string> ChatStreamAsync(
        List<ChatTurn>? history,
        string prompt,
        CancellationToken cancellationToken = default);

    public virtual IAsyncEnumerable<string> ChatStreamAsync(
        List<ChatTurn>? history,
        string prompt,
        Action<string>? onReasoningDelta,
        CancellationToken cancellationToken = default) =>
        ChatStreamAsync(history, prompt, onReasoningDelta, onToolStatus: null, cancellationToken);

    public virtual IAsyncEnumerable<string> ChatStreamAsync(
        List<ChatTurn>? history,
        string prompt,
        Action<string>? onReasoningDelta,
        Action<ToolStatus>? onToolStatus,
        CancellationToken cancellationToken = default) =>
        ChatStreamAsync(history, prompt, cancellationToken);

    protected async Task<ToolResult> ExecuteToolAsync(string name, string arguments, CancellationToken ct)
    {
        if (!Tools.TryGetValue(name, out var tool))
            return ToolResult.Error($"Unknown tool: {name}");

        if (tool.RequiresApproval && Permissions is not null)
        {
            var approved = await Permissions.RequestAsync(name, arguments, ct, AgentId);
            if (!approved)
                return ToolResult.Error($"User denied approval for tool '{name}'.");
        }

        DebugLog.Write($"[{GetType().Name}] Executing tool: {name}");
        var argsElement = JsonSerializer.Deserialize<JsonElement>(arguments, Json.Options);

        return await tool.ExecuteAsync(argsElement, ct);
    }
}
