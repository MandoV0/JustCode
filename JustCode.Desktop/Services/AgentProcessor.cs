using JustCode.Infrastructure;
using JustCode.Tools;

namespace JustCode.Services;

/// <summary>
/// Runs chat streams concurrently, keyed by a client-supplied agent id so each
/// tab can stream, be cancelled, and report status independently.
/// </summary>
internal sealed class AgentProcessor
{
    private const int MaxToolOutputChars = 4000;

    private readonly object _lock = new();
    private readonly Dictionary<string, CancellationTokenSource> _streams = new();

    private readonly ApiConfigService _apiConfigs;
    private readonly ProjectService _projects;
    private readonly List<ITool> _tools;
    private readonly PermissionService _permissions;

    public AgentProcessor(ApiConfigService apiConfigs, ProjectService projects, List<ITool> tools, PermissionService permissions)
    {
        _apiConfigs = apiConfigs;
        _projects = projects;
        _tools = tools;
        _permissions = permissions;
    }

    public async Task<string> RunAsync(
        string agentId,
        List<ChatTurn>? history,
        string prompt,
        string thinking,
        string? configId,
        string? projectId,
        Action<string> onChunk,
        Action<ToolStatus> onToolStatus,
        Action<string> onReasoningDelta)
    {
        if (!string.IsNullOrWhiteSpace(projectId)) _projects.SetActive(projectId);

        var provider = ResolveProvider(configId);
        provider.ThinkingEffort = thinking;
        provider.AgentId = agentId;

        using var cts = new CancellationTokenSource();
        lock (_lock)
        {
            _streams[agentId] = cts;
        }

        try
        {
            await foreach (var chunk in provider.ChatStreamAsync(
                history,
                prompt,
                onReasoningDelta: d => onReasoningDelta(d),
                onToolStatus: s => onToolStatus(CapToolOutput(s)),
                cts.Token))
            {
                onChunk(chunk);
            }

            return "done";
        }
        catch (OperationCanceledException)
        {
            DebugLog.Write($"Stream cancelled for agent '{agentId}'");
            return "cancelled";
        }
        finally
        {
            lock (_lock)
            {
                _streams.Remove(agentId);
            }
        }
    }

    public void Cancel(string agentId)
    {
        lock (_lock)
        {
            if (_streams.TryGetValue(agentId, out var cts))
            {
                cts.Cancel();
            }
        }
    }

    private LlmProviderService ResolveProvider(string? configId)
    {
        var config = _apiConfigs.Get(configId);
        if (config is null)
            throw new InvalidOperationException(
                "No API configuration selected. Open Settings and add an API config first.");

        return new OpenAIService(new OpenAiConfig
        {
            BaseUrl = config.BaseUrl,
            ApiKey = config.ApiKey,
            Model = config.Model,
            StrictMode = config.StrictMode,
            EnableThinking = config.EnableThinking,
            MaxContextTokens = config.MaxContextTokens,
            SystemPrompt = BuildSystemPrompt()
        }, _tools, _permissions);
    }

    private string BuildSystemPrompt()
    {
        var projectName = _projects.ActiveProject?.Name;
        if (string.IsNullOrWhiteSpace(projectName))
            projectName = "Unnamed project";

        return $"Project: {projectName}\nWorkspace root: {_projects.Root}\n" +
               "You are JustCode, an AI coding assistant. All file and command operations are scoped to the workspace root. " +
               "Prefer the provided tools over guessing file contents.";
    }

    private static ToolStatus CapToolOutput(ToolStatus status)
    {
        if (status.Output is null || status.Output.Length <= MaxToolOutputChars)
            return status;

        return status with { Output = OutputTruncator.Tail(status.Output, MaxToolOutputChars) };
    }
}
