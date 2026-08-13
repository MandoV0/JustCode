using System.Runtime.CompilerServices;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using JustCode.Infrastructure;
using JustCode.Tools;

namespace JustCode.Services;

public sealed record OpenAiConfig(
    string BaseUrl = "https://api.openai.com/v1/chat/completions",
    string ApiKey = "",
    string Model = "gpt-5.6-luna",
    bool StrictMode = false,
    bool EnableThinking = false,
    string? SystemPrompt = null,
    int MaxContextTokens = 64_000
)
{
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

public sealed class OpenAIService(OpenAiConfig config, List<ITool> tools, PermissionService? permissions = null)
    : LlmProviderService(tools, permissions)
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
                AddTurn(messages, t);
            }
        }

        messages.Add(new
        {
            role = "user",
            content = (object?)prompt,
            tool_calls = (object?)null,
            tool_call_id = (string?)null
        });

        if (!string.IsNullOrWhiteSpace(config.SystemPrompt))
        {
            messages.Insert(0, new
            {
                role = "system",
                content = (object?)config.SystemPrompt,
                tool_calls = (object?)null,
                tool_call_id = (string?)null
            });
        }

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

            if (config.EnableThinking)
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

            if (activeTools.Count == 0) yield break;

            DebugLog.Write($"[OpenAIService] Tool round {round + 1}/{MaxToolRounds}, calls: {activeTools.Count}");

            var finalTools = activeTools.Values.Select(a => new
            {
                id = a.Id,
                type = "function",
                function = new { name = a.Name, arguments = a.Args.ToString() }
            }).ToList();

            var assistantContent = fullContent.Length > 0 ? fullContent.ToString() : null;

            if (config.EnableThinking)
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

    private void AddTurn(List<object> messages, ChatTurn t)
    {
        if (t.Role == "system")
        {
            messages.Add(new
            {
                role = "system",
                content = (object?)t.Text,
                tool_calls = (object?)null,
                tool_call_id = (string?)null
            });
            return;
        }

        if (t.Role == "user")
        {
            messages.Add(new
            {
                role = "user",
                content = (object?)t.Text,
                tool_calls = (object?)null,
                tool_call_id = (string?)null
            });
            return;
        }

        var runs = new List<(string Name, string Args, string Output)>();
        var thinkingText = new StringBuilder();

        if (t.Blocks is not null)
        {
            foreach (var block in t.Blocks)
            {
                if (block.ValueKind != JsonValueKind.Object || !block.TryGetProperty("type", out var typeEl))
                    continue;

                if (typeEl.GetString() == "tool" && block.TryGetProperty("run", out var run) && run.ValueKind == JsonValueKind.Object)
                {
                    var name = run.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? string.Empty : string.Empty;
                    var args = run.TryGetProperty("arguments", out var argsProp) ? argsProp.GetString() ?? string.Empty : string.Empty;
                    var output = run.TryGetProperty("output", out var outputProp) ? outputProp.GetString() ?? string.Empty : string.Empty;
                    runs.Add((name, args, output));
                }
                else if (typeEl.GetString() == "thinking" && block.TryGetProperty("text", out var textProp))
                {
                    thinkingText.Append(textProp.GetString());
                }
            }
        }

        if (runs.Count == 0)
        {
            if (config.EnableThinking)
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

            return;
        }

        var reasoning = thinkingText.Length > 0 ? thinkingText.ToString() : t.Reasoning;
        var toolCalls = runs.Select((r, i) => new
        {
            id = $"call_{i}",
            type = "function",
            function = new { name = r.Name, arguments = r.Args }
        }).ToList();

        if (config.EnableThinking)
        {
            messages.Add(new
            {
                role = "assistant",
                content = (object?)(string.IsNullOrEmpty(t.Text) ? null : t.Text),
                reasoning_content = (object?)(reasoning ?? string.Empty),
                tool_calls = (object?)toolCalls,
                tool_call_id = (string?)null
            });
        }
        else
        {
            messages.Add(new
            {
                role = "assistant",
                content = (object?)(string.IsNullOrEmpty(t.Text) ? null : t.Text),
                tool_calls = (object?)toolCalls,
                tool_call_id = (string?)null
            });
        }

        for (var i = 0; i < runs.Count; i++)
        {
            messages.Add(new
            {
                role = "tool",
                content = (object?)runs[i].Output,
                tool_calls = (object?)null,
                tool_call_id = (string?)$"call_{i}"
            });
        }
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
