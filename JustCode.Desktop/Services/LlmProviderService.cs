using System.Text.Json;
using JustCode.Infrastructure;

namespace JustCode.Services;

public sealed record ChatTurn(string Role, string Text, string? Reasoning = null);

public sealed record ToolStatus(string Name, string Arguments, string State, string? Output = null);

public abstract class LlmProviderService(List<ITool> tools)
{
    protected static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(120) };
    protected readonly Dictionary<string, ITool> Tools = tools.ToDictionary(t => t.Name);

    public string? ThinkingEffort { get; set; }

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

    protected async Task<string> ExecuteToolAsync(string name, string arguments, CancellationToken ct)
    {
        if (!Tools.TryGetValue(name, out var tool))
            return ToolResult.Error($"Unknown tool: {name}").Output;

        DebugLog.Write($"[{GetType().Name}] Executing tool: {name}");
        var argsElement = JsonSerializer.Deserialize<JsonElement>(arguments, Json.Options);
        
        return (await tool.ExecuteAsync(argsElement, ct)).Output;
    }
}