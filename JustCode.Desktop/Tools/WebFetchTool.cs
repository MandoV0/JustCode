using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace JustCode.Tools;

public class WebFetchTool : ITool
{
    private static readonly HttpClient Http = CreateClient();

    private static readonly HashSet<string> BlockedHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "localhost", "127.0.0.1", "::1", "0.0.0.0", "[::1]", "[::]"
    };

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

    /// <summary>Network access is gated behind user approval.</summary>
    public bool RequiresApproval => true;

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

        // SSRF guard: never fetch loopback/private/link-local addresses (or localhost
        // hostnames that resolve to them), including the embedded LocalServer.
        if (await CheckSsrFAsync(uri, cancellationToken) is { } ssrfError)
        {
            return ssrfError;
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

    private static async Task<ToolResult?> CheckSsrFAsync(Uri uri, CancellationToken cancellationToken)
    {
        var host = uri.Host.Trim('[', ']');
        if (BlockedHosts.Contains(host))
        {
            return ToolResult.Error("Fetching local/loopback addresses is not allowed.");
        }

        IPAddress[] addresses;
        if (IPAddress.TryParse(host, out var literal))
        {
            addresses = [literal];
        }
        else
        {
            try
            {
                addresses = await Dns.GetHostAddressesAsync(host, cancellationToken);
            }
            catch
            {
                return ToolResult.Error($"Could not resolve host '{host}'; fetch blocked.");
            }
        }

        foreach (var addr in addresses)
        {
            if (IsBlockedAddress(addr))
            {
                return ToolResult.Error("Fetching private, loopback, or link-local addresses is not allowed.");
            }
        }

        return null;
    }

    private static bool IsBlockedAddress(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();

        if (IPAddress.IsLoopback(address) || address.IsIPv6LinkLocal || address.IsIPv6SiteLocal)
        {
            return true;
        }

        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = address.GetAddressBytes();
            return b[0] == 10                          // 10/8
                || (b[0] == 172 && b[1] is >= 16 and <= 31) // 172.16/12
                || (b[0] == 192 && b[1] == 168)        // 192.168/16
                || (b[0] == 169 && b[1] == 254)        // 169.254/16 (link-local / cloud metadata)
                || b[0] == 127;                        // 127/8
        }

        return false;
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
