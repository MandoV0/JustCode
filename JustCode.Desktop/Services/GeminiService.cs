using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using JustCode.Infrastructure;

namespace JustCode.Services;

internal sealed record GeminiInteractionResponse(
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("steps")] List<GeminiStepDto>? Steps,
    [property: JsonPropertyName("error")] GeminiErrorDto? Error
);

internal sealed record GeminiStepDto(
    [property: JsonPropertyName("type")] string? Type,
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("call_id")] string? CallId,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("arguments")] JsonElement? Arguments,
    [property: JsonPropertyName("content")] List<GeminiContentBlockDto>? Content
);

internal sealed record GeminiContentBlockDto(
    [property: JsonPropertyName("type")] string? Type,
    [property: JsonPropertyName("text")] string? Text
);

internal sealed record GeminiErrorDto([property: JsonPropertyName("message")] string? Message);

internal sealed record GeminiChatResult(string Text, string InteractionId);

internal sealed record GeminiToolDeclaration(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("parameters")] object Parameters
);

internal sealed record GeminiRequest(
    [property: JsonPropertyName("model")] string Model,
    [property: JsonPropertyName("input")] object[] Input,
    [property: JsonPropertyName("tools")] GeminiToolDeclaration[] Tools,
    [property: JsonPropertyName("previous_interaction_id")] string? PreviousInteractionId = null
);

internal sealed class GeminiService
{
    private const string ApiBase = "https://generativelanguage.googleapis.com/v1beta";
    private const string DefaultModel = "gemini-3.6-flash";
    private const int MaxToolRounds = 10;

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(120) };

    private readonly Dictionary<string, ITool> _tools;
    private readonly GeminiToolDeclaration[] _toolDeclarations;

    public GeminiService(List<ITool> tools)
    {
        _tools = tools.ToDictionary(t => t.Name);
        _toolDeclarations = tools
            .Select(t => new GeminiToolDeclaration("function", t.Name, t.Description, t.ParameterSchema))
            .ToArray();
    }

    public async Task<GeminiChatResult> ChatAsync(
        List<ChatTurn>? history,
        string prompt,
        string? previousInteractionId = null,
        CancellationToken cancellationToken = default)
    {
        var key = EnvLoader.Require("GEMINI_API_KEY");
        var model = EnvLoader.Get("GEMINI_MODEL") is { Length: > 0 } m ? m : DefaultModel;

        var inputList = (history ?? [])
            .Select(t => (object)new
            {
                type = t.Role is "assistant" or "model" ? "model_output" : "user_input",
                content = new[] { TextBlock(t.Text) }
            })
            .Append(new { type = "user_input", content = new[] { TextBlock(prompt) } })
            .ToList();

        var interactionId = previousInteractionId;

        for (var round = 0; round < MaxToolRounds; round++)
        {
            var body = new GeminiRequest(model, [.. inputList], _toolDeclarations, interactionId);

            using var req = new HttpRequestMessage(HttpMethod.Post, $"{ApiBase}/interactions");
            req.Headers.TryAddWithoutValidation("x-goog-api-key", key);
            req.Content = new StringContent(JsonSerializer.Serialize(body, Json.Options), Encoding.UTF8, "application/json");

            using var res = await Http.SendAsync(req, cancellationToken);
            var raw = await res.Content.ReadAsStringAsync(cancellationToken);
            var dto = JsonSerializer.Deserialize<GeminiInteractionResponse>(raw, Json.Options);

            if (!res.IsSuccessStatusCode)
            {
                var msg = dto?.Error?.Message ?? $"Gemini API returned status {(int)res.StatusCode}";
                DebugLog.Write($"Gemini API error ({(int)res.StatusCode}): {msg}");
                throw new InvalidOperationException(msg);
            }

            if (dto?.Id is not { } id)
                throw new InvalidOperationException("Gemini returned a response without an ID.");

            interactionId = id;

            var lastStep = dto.Steps?.LastOrDefault();
            if (lastStep?.Type == "function_call")
            {
                if (lastStep.Name is null || !_tools.TryGetValue(lastStep.Name, out var tool))
                    throw new InvalidOperationException($"Gemini requested unknown function: {lastStep.Name}");

                DebugLog.Write($"Gemini tool call round {round + 1}: {lastStep.Name}");

                var result = lastStep.Arguments is { } args
                    ? await tool.ExecuteAsync(args, cancellationToken)
                    : ToolResult.Error($"{lastStep.Name} called with no arguments.");

                var callId = lastStep.CallId ?? lastStep.Id;
                inputList = [new { type = "function_result", name = lastStep.Name, call_id = callId, result = new[] { TextBlock(result.Output) } }];
                continue;
            }

            var text = ExtractText(dto.Steps);
            if (string.IsNullOrWhiteSpace(text))
                throw new InvalidOperationException("Gemini returned no text output.");

            return new GeminiChatResult(text, interactionId);
        }

        throw new InvalidOperationException($"Gemini tool call loop exceeded {MaxToolRounds} rounds without a final response.");
    }

    public Task<GeminiChatResult> ChatAsync(string prompt, string? previousInteractionId = null, CancellationToken cancellationToken = default)
        => ChatAsync(null, prompt, previousInteractionId, cancellationToken);

    private static object TextBlock(string text) => new { type = "text", text };

    private static string ExtractText(List<GeminiStepDto>? steps)
    {
        if (steps is null or []) return string.Empty;

        var from = steps.FindLastIndex(s => s.Type == "function_result") + 1;
        var builder = new StringBuilder();

        foreach (var step in steps.Skip(from).Where(s => s.Type == "model_output" && s.Content is not null))
            foreach (var block in step.Content!.Where(c => c.Type == "text" && !string.IsNullOrEmpty(c.Text)))
                builder.Append(block.Text);

        return builder.ToString();
    }
}