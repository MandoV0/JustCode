using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace JustCode.Tools;

public class WebFetchTool : ITool
{
    private static readonly HttpClient Http = CreateClient();

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("JustCode/0.1 (coding agent)");
        return client;
    }

    private const long MaxFetchBytes = 10L * 1024 * 1024;

    public string Name => "web_fetch";
    public string Description =>
        "Fetches a URL over http(s) and returns its content as plain text. HTML pages are stripped down to readable text.";

    public object ParameterSchema => new
    {
        type = "object",
        properties = new
        {
            url = new { type = "string", description = "Absolute http(s) URL to fetch." },
            max_chars = new
            {
                type = "integer",
                description = "Maximum characters to return. Defaults to 12000, maximum 50000.",
            },
        },
        required = new[] { "url" },
    };

    public async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var url = arguments.GetProperty("url").GetString() ?? string.Empty;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
        {
            return ToolResult.Error("url must be an absolute http/https URL.");
        }

        var maxChars = arguments.TryGetProperty("max_chars", out var m) && m.ValueKind == JsonValueKind.Number
            ? Math.Clamp(m.GetInt32(), 500, 50_000)
            : 12_000;

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, uri);
            req.Headers.TryAddWithoutValidation("Accept", "text/html,text/plain;q=0.9,*/*;q=0.5");

            using var res = await Http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            res.EnsureSuccessStatusCode();

            var mediaType = res.Content.Headers.ContentType?.MediaType ?? string.Empty;
            var charset = res.Content.Headers.ContentType?.CharSet;

            var bytes = await ReadCappedAsync(res, cancellationToken);
            var text = Decode(bytes, charset);

            if (mediaType.Contains("text/html", StringComparison.OrdinalIgnoreCase) || LooksLikeHtml(text))
            {
                text = HtmlToText(text);
            }

            text = text.Trim();
            if (text.Length > maxChars)
            {
                text = text[..maxChars] + "\n\n…(truncated)";
            }

            return ToolResult.Ok(text.Length == 0 ? "(empty page)" : text);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException)
        {
            return ToolResult.Error($"Fetch failed: {ex.Message}");
        }
    }

    private static async Task<byte[]> ReadCappedAsync(HttpResponseMessage res, CancellationToken cancellationToken)
    {
        using var stream = await res.Content.ReadAsStreamAsync(cancellationToken);
        using var buffer = new MemoryStream();
        var chunk = new byte[81_920];
        long total = 0;
        int read;
        while ((read = await stream.ReadAsync(chunk, cancellationToken)) > 0)
        {
            total += read;
            if (total > MaxFetchBytes)
            {
                throw new InvalidOperationException($"Response exceeds the {MaxFetchBytes / (1024 * 1024)} MB limit.");
            }
            await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
        }
        return buffer.ToArray();
    }

    private static string Decode(byte[] bytes, string? charset)
    {
        if (!string.IsNullOrWhiteSpace(charset))
        {
            try
            {
                return Encoding.GetEncoding(charset).GetString(bytes);
            }
            catch (ArgumentException)
            {
                // Unknown charset, fall back to UTF-8.
            }
        }

        return Encoding.UTF8.GetString(bytes);
    }

    private static bool LooksLikeHtml(string text)
    {
        var trimmed = text.TrimStart();
        return trimmed.StartsWith("<!doctype", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("<html", StringComparison.OrdinalIgnoreCase);
    }

    private static string HtmlToText(string html)
    {
        html = Regex.Replace(html, "(?is)<(script|style|noscript|svg|head|template|iframe)[^>]*>.*?</\\1>", " ");
        html = Regex.Replace(html, "(?i)<br\\s*/?>", "\n");
        html = Regex.Replace(
            html,
            "(?i)</(p|div|li|ul|ol|h[1-6]|tr|section|article|blockquote|pre|table|form|header|footer|title)>",
            "\n");
        html = Regex.Replace(html, "(?i)<li[^>]*>", "\n- ");
        html = Regex.Replace(html, "<[^>]+>", string.Empty);
        html = WebUtility.HtmlDecode(html);
        html = Regex.Replace(html, "[ \t]+", " ");
        html = Regex.Replace(html, "[\\r\\n]{3,}", "\n\n");
        return html.Trim();
    }
}
