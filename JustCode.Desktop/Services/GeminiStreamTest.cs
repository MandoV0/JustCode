using System.Text;
using JustCode.Infrastructure;

namespace JustCode.Services;

internal static class GeminiStreamTest
{
    private const string ApiBase =
        "https://generativelanguage.googleapis.com/v1beta";

    private const string Model = "gemini-3.6-flash";

    public static async Task RunAsync()
    {
        var key = EnvLoader.Require(
            "GEMINI_API_KEY",
            "GEMINI_API_KEY is not set");

        var url =
            $"{ApiBase}/models/{Model}:streamGenerateContent?alt=sse";

        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            url);

        request.Headers.TryAddWithoutValidation(
            "x-goog-api-key",
            key);

        var json = """
        {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": "Explain what a compiler does in 3 sentences + a tiny pseudo code example"
                        }
                    ]
                }
            ]
        }
        """;

        request.Content = new StringContent(
            json,
            Encoding.UTF8,
            "application/json");

        using var client = new HttpClient();

        Console.WriteLine("Sending request...");
        Console.WriteLine();

        using var response = await client.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead);

        Console.WriteLine(
            $"Status: {(int)response.StatusCode} {response.StatusCode}");
        Console.WriteLine();

        if (!response.IsSuccessStatusCode)
        {
            Console.WriteLine(
                await response.Content.ReadAsStringAsync());

            return;
        }

        using var stream =
            await response.Content.ReadAsStreamAsync();

        using var reader =
            new StreamReader(stream);

        while (await reader.ReadLineAsync() is { } line)
        {
            Console.WriteLine($"RAW: {line}");
        }

        Console.WriteLine();
        Console.WriteLine("Stream finished.");
    }
}