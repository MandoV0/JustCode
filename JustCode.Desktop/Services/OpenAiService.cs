using System.Runtime.CompilerServices;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using JustCode.Infrastructure;

namespace JustCode.Services;

public sealed record OpenAiConfig(
    string BaseUrl = "https://api.openai.com/v1/chat/completions",
    string ApiKey = "",
    string Model = "gpt-4o",
    bool StrictMode = false
)
{
    public bool IsDeepSeek =>
        Model.Contains("deepseek", StringComparison.OrdinalIgnoreCase) ||
        BaseUrl.Contains("deepseek", StringComparison.OrdinalIgnoreCase);

    public string NormalizedUrl
    {
        get
        {
            var url = BaseUrl.TrimEnd('/');
            if (url.EndsWith("/chat/completions", StringComparison.OrdinalIgnoreCase))
                return url;
            if (url.EndsWith("/v1", StringComparison.OrdinalIgnoreCase))
                return $"{url}/chat/completions";
            return $"{url}/v1/chat/completions";
        }
    }
}

public sealed class OpenAIService(OpenAiConfig config, List<ITool> tools) : LlmProviderService(tools)
{
    private const int MaxToolRounds = 32;

    public override IAsyncEnumerable<string> ChatStreamAsync(
        List<ChatTurn>? history,
        string prompt,
        CancellationToken cancellationToken = default) =>
        ChatStreamAsync(history, prompt, onReasoningDelta: null, onToolStatus: null, cancellationToken);

    public override IAsyncEnumerable<string> ChatStreamAsync(
        List<ChatTurn>? history,
        string prompt,
        Action<string>? onReasoningDelta,
        CancellationToken cancellationToken = default) =>
        ChatStreamAsync(history, prompt, onReasoningDelta, onToolStatus: null, cancellationToken);

    public override async IAsyncEnumerable<string> ChatStreamAsync(
        List<ChatTurn>? history,
        string prompt,
        Action<string>? onReasoningDelta,
        Action<ToolStatus>? onToolStatus,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var messages = new List<object>();

        if (history is not null)
        {
            foreach (var t in history)
            {
                if (t.Role is "assistant" or "model")
                {
                    if (config.IsDeepSeek)
                    {
                        messages.Add(new
                        {
                            role = "assistant",
                            content = (object?)t.Text,
                            reasoning_content = (object?)(t.Reasoning ?? string.Empty),
                            tool_calls = (object?)null,
                            tool_call_id = (string?)null
                        });
                    }
                    else
                    {
                        messages.Add(new
                        {
                            role = "assistant",
                            content = (object?)t.Text,
                            tool_calls = (object?)null,
                            tool_call_id = (string?)null
                        });
                    }
                }
                else
                {
                    messages.Add(new
                    {
                        role = "user",
                        content = (object?)t.Text,
                        tool_calls = (object?)null,
                        tool_call_id = (string?)null
                    });
                }
            }
        }

        messages.Add(new
        {
            role = "user",
            content = (object?)prompt,
            tool_calls = (object?)null,
            tool_call_id = (string?)null
        });

        var toolDeclarations = Tools.Values.Select(t => new
        {
            type = "function",
            function = new
            {
                name = t.Name,
                description = t.Description,
                parameters = t.ParameterSchema,
                strict = config.StrictMode ? (bool?)true : null
            }
        }).ToArray();

        for (var round = 0; round < MaxToolRounds; round++)
        {
            var requestBody = new Dictionary<string, object?>
            {
                ["model"] = config.Model,
                ["stream"] = true,
                ["messages"] = messages,
                ["tools"] = toolDeclarations.Length > 0 ? toolDeclarations : null
            };

            if (config.IsDeepSeek)
            {
                requestBody["thinking"] = new { type = "enabled" };
                if (ThinkingEffort is { Length: > 0 } and not "default")
                    requestBody["reasoning_effort"] = ThinkingEffort;
            }

            using var req = new HttpRequestMessage(HttpMethod.Post, config.NormalizedUrl);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.ApiKey);
            req.Content = new StringContent(JsonSerializer.Serialize(requestBody, Json.Options), Encoding.UTF8, "application/json");

            using var res = await Http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            res.EnsureSuccessStatusCode();

            using var stream = await res.Content.ReadAsStreamAsync(cancellationToken);
            using var reader = new StreamReader(stream);

            var fullContent = new StringBuilder();
            var fullReasoning = new StringBuilder();
            var activeTools = new Dictionary<int, ToolCallAccumulator>();

            while (await reader.ReadLineAsync(cancellationToken) is { } line)
            {
                if (!line.StartsWith("data: ") || line.EndsWith("[DONE]")) continue;

                var chunk = JsonSerializer.Deserialize<OpenAiChunk>(line.AsSpan(6), Json.Options)?.Choices?.FirstOrDefault()?.Delta;
                if (chunk is null) continue;

                // Support both DeepSeek reasoning_content and OpenAI reasoning delta
                var reasoningDelta = chunk.ReasoningContent ?? chunk.Reasoning;
                if (!string.IsNullOrEmpty(reasoningDelta))
                {
                    fullReasoning.Append(reasoningDelta);
                    onReasoningDelta?.Invoke(reasoningDelta);
                }

                if (!string.IsNullOrEmpty(chunk.Content))
                {
                    fullContent.Append(chunk.Content);
                    yield return chunk.Content;
                }

                if (chunk.ToolCalls is not null)
                {
                    foreach (var tc in chunk.ToolCalls)
                    {
                        if (!activeTools.TryGetValue(tc.Index, out var acc))
                            activeTools[tc.Index] = acc = new ToolCallAccumulator(tc.Id ?? "", tc.Function?.Name ?? "");

                        if (!string.IsNullOrEmpty(tc.Id)) acc.Id = tc.Id;
                        if (!string.IsNullOrEmpty(tc.Function?.Name)) acc.Name = tc.Function.Name;
                        acc.Args.Append(tc.Function?.Arguments);
                    }
                }
            }

            // No tool calls => final text response and done
            if (activeTools.Count == 0) yield break;

            DebugLog.Write($"[OpenAIService] Tool round {round + 1}/{MaxToolRounds}, calls: {activeTools.Count}");

            var finalTools = activeTools.Values.Select(a => new
            {
                id = a.Id,
                type = "function",
                function = new { name = a.Name, arguments = a.Args.ToString() }
            }).ToList();

            var assistantContent = fullContent.Length > 0 ? fullContent.ToString() : null;

            if (config.IsDeepSeek)
            {
                messages.Add(new
                {
                    role = "assistant",
                    content = (object?)assistantContent,
                    reasoning_content = (object?)fullReasoning.ToString(),
                    tool_calls = (object?)finalTools,
                    tool_call_id = (string?)null
                });
            }
            else
            {
                messages.Add(new
                {
                    role = "assistant",
                    content = (object?)assistantContent,
                    tool_calls = (object?)finalTools,
                    tool_call_id = (string?)null
                });
            }

            // Execute tools in parallel for speed
            var toolTasks = finalTools.Select(async call =>
            {
                onToolStatus?.Invoke(new ToolStatus(call.function.name, call.function.arguments, "started"));
                var result = await ExecuteToolAsync(call.function.name, call.function.arguments, cancellationToken);
                onToolStatus?.Invoke(new ToolStatus(call.function.name, call.function.arguments, "done", result));
                return new
                {
                    role = "tool",
                    content = (object?)result,
                    tool_calls = (object?)null,
                    tool_call_id = (string?)call.id
                };
            });

            var toolResults = await Task.WhenAll(toolTasks);
            messages.AddRange(toolResults);
        }

        throw new InvalidOperationException($"OpenAI/DeepSeek tool call loop exceeded {MaxToolRounds} rounds without a final response.");
    }

    private sealed class ToolCallAccumulator(string id, string name)
    {
        public string Id { get; set; } = id;
        public string Name { get; set; } = name;
        public StringBuilder Args { get; } = new();
    }

    private record OpenAiChunk(
        [property: JsonPropertyName("choices")] List<Choice>? Choices
    );

    private record Choice(
        [property: JsonPropertyName("delta")] Delta? Delta
    );

    private record Delta(
        [property: JsonPropertyName("content")] string? Content,
        [property: JsonPropertyName("reasoning_content")] string? ReasoningContent,
        [property: JsonPropertyName("reasoning")] string? Reasoning,
        [property: JsonPropertyName("tool_calls")] List<ToolCall>? ToolCalls
    );

    private record ToolCall(
        [property: JsonPropertyName("index")] int Index,
        [property: JsonPropertyName("id")] string? Id,
        [property: JsonPropertyName("function")] ToolCallFunc? Function
    );

    private record ToolCallFunc(
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("arguments")] string? Arguments
    );
}