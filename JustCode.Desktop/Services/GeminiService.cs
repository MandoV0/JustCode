using System.Text;
using System.Text.Json;
using JustCode.Infrastructure;

namespace JustCode.Services;

internal sealed record ChatTurn(string Role, string Text);

internal sealed class GeminiService
{
    private const string ApiBase = "https://generativelanguage.googleapis.com/v1beta";
    private const string DefaultModel = "gemini-3.6-flash";

    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromSeconds(120)
    };

    public async Task<string> ChatAsync(List<ChatTurn> history, string prompt)
    {
        DebugLog.Write("=== Gemini ChatAsync START ===");

        try
        {
            DebugLog.Write("Loading API key...");

            var key = EnvLoader.Require(
                "GEMINI_API_KEY",
                "GEMINI_API_KEY is not set");

            DebugLog.Write("API key loaded");

            var configuredModel = EnvLoader.Get("GEMINI_MODEL");

            var model = string.IsNullOrWhiteSpace(configuredModel)
                ? DefaultModel
                : configuredModel;

            DebugLog.Write($"Using model: {model}");
            DebugLog.Write($"History turns: {history.Count}");
            DebugLog.Write($"Prompt length: {prompt.Length}");

            var contents = new List<object>();

            foreach (var turn in history)
            {
                contents.Add(new
                {
                    role = turn.Role == "user" ? "user" : "model",
                    parts = new object[]
                    {
                        new { text = turn.Text }
                    }
                });
            }

            contents.Add(new
            {
                role = "user",
                parts = new object[]
                {
                    new { text = prompt }
                }
            });

            var url = $"{ApiBase}/models/{model}:generateContent";

            DebugLog.Write($"Request URL: {url}");
            DebugLog.Write("Building HTTP request...");

            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                url);

            request.Headers.TryAddWithoutValidation(
                "x-goog-api-key",
                key);

            var json = JsonSerializer.Serialize(new
            {
                contents
            });

            DebugLog.Write($"Request JSON length: {json.Length}");

            request.Content = new StringContent(
                json,
                Encoding.UTF8,
                "application/json");

            DebugLog.Write("Sending request to Gemini...");

            using var response = await Http.SendAsync(request);

            DebugLog.Write(
                $"Gemini responded. Status: {(int)response.StatusCode} {response.StatusCode}");

            var raw = await response.Content.ReadAsStringAsync();

            DebugLog.Write($"Response length: {raw.Length}");

            if (raw.Length < 500)
            {
                DebugLog.Write($"Response body: {raw}");
            }

            DebugLog.Write("Parsing JSON...");

            using var doc = JsonDocument.Parse(raw);

            if (!response.IsSuccessStatusCode)
            {
                DebugLog.Write("Gemini returned an error status");

                var message =
                    doc.RootElement.TryGetProperty("error", out var error)
                    && error.TryGetProperty("message", out var m)
                    && m.GetString() is { Length: > 0 } msg
                        ? msg
                        : $"Gemini API returned status {(int)response.StatusCode}";

                DebugLog.Write($"Error message: {message}");

                throw new InvalidOperationException(message);
            }

            DebugLog.Write("Extracting candidates...");

            if (!doc.RootElement.TryGetProperty("candidates", out var candidates))
            {
                throw new InvalidOperationException(
                    "Gemini response has no candidates");
            }

            if (candidates.GetArrayLength() == 0)
            {
                throw new InvalidOperationException(
                    "Gemini returned zero candidates");
            }

            var candidate = candidates[0];

            if (!candidate.TryGetProperty("content", out var content))
            {
                throw new InvalidOperationException(
                    "Gemini candidate has no content");
            }

            if (!content.TryGetProperty("parts", out var parts))
            {
                throw new InvalidOperationException(
                    "Gemini content has no parts");
            }

            var text = string.Concat(
                parts.EnumerateArray()
                    .Select(part =>
                        part.TryGetProperty("text", out var t)
                            ? t.GetString()
                            : string.Empty));

            DebugLog.Write($"Extracted text length: {text.Length}");

            if (string.IsNullOrWhiteSpace(text))
            {
                throw new InvalidOperationException(
                    "Gemini returned empty text");
            }

            DebugLog.Write("=== Gemini ChatAsync SUCCESS ===");

            return text;
        }
        catch (Exception ex)
        {
            DebugLog.Write($"=== Gemini FAILED ===");
            DebugLog.Write(ex.ToString());

            throw;
        }
    }
}