using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace JustCode.Tools;

public class WebSearchTool : ITool
{
    private static readonly HttpClient Http = CreateClient();

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36");
        return client;
    }

    public string Name => "web_search";
    public string Description =>
        "Searches the web (Bing, DuckDuckGo fallback) and returns ranked results with title, url and snippet.";

    public object ParameterSchema => new
    {
        type = "object",
        properties = new
        {
            query = new { type = "string", description = "The search query." },
            max_results = new
            {
                type = "integer",
                description = "How many results to return. Defaults to 8, maximum 10.",
            },
        },
        required = new[] { "query" },
    };

    public async Task<ToolResult> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken)
    {
        var query = arguments.GetProperty("query").GetString() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(query))
        {
            return ToolResult.Error("query must not be empty.");
        }

        var maxResults = arguments.TryGetProperty("max_results", out var m) && m.ValueKind == JsonValueKind.Number
            ? Math.Clamp(m.GetInt32(), 1, 10)
            : 8;

        try
        {
            var results = await SearchBingAsync(query, cancellationToken);
            if (results.Count == 0)
            {
                results = await SearchDuckDuckGoAsync(query, cancellationToken);
            }

            if (results.Count == 0)
            {
                return ToolResult.Error("No results found.");
            }

            var sb = new StringBuilder();
            var count = Math.Min(results.Count, maxResults);
            for (var i = 0; i < count; i++)
            {
                sb.Append($"{i + 1}. ").AppendLine(results[i].Title)
                    .Append("   ").AppendLine(results[i].Url);
                if (!string.IsNullOrWhiteSpace(results[i].Snippet))
                {
                    sb.Append("   ").AppendLine(results[i].Snippet);
                }
                sb.AppendLine();
            }

            return ToolResult.Ok(sb.ToString().TrimEnd());
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            return ToolResult.Error($"Search failed: {ex.Message}");
        }
    }

    private static async Task<List<SearchResult>> SearchBingAsync(string query, CancellationToken cancellationToken)
    {
        var url = "https://www.bing.com/search?q=" + Uri.EscapeDataString(query) + "&format=rss";
        var xml = await Http.GetStringAsync(url, cancellationToken);
        return ParseBingRss(xml);
    }

    private static List<SearchResult> ParseBingRss(string xml)
    {
        var results = new List<SearchResult>();
        foreach (Match item in Regex.Matches(xml, "<item>(?<item>.*?)</item>", RegexOptions.Singleline))
        {
            var block = item.Groups["item"].Value;
            var title = Extract(block, "<title>(?<v>.*?)</title>");
            var link = Extract(block, "<link>(?<v>.*?)</link>");
            var snippet = Extract(block, "<description>(?<v>.*?)</description>");

            if (string.IsNullOrWhiteSpace(link)) continue;

            results.Add(new SearchResult(
                WebUtility.HtmlDecode(CleanTags(title)).Trim(),
                WebUtility.HtmlDecode(link).Trim(),
                WebUtility.HtmlDecode(CleanTags(snippet)).Trim()));
        }
        return results;
    }

    private static async Task<List<SearchResult>> SearchDuckDuckGoAsync(string query, CancellationToken cancellationToken)
    {
        var url = "https://api.duckduckgo.com/?q=" + Uri.EscapeDataString(query) + "&format=json&no_html=1&skip_disambig=1";
        var json = await Http.GetStringAsync(url, cancellationToken);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var results = new List<SearchResult>();

        if (root.TryGetProperty("AbstractText", out var abstractEl)
            && abstractEl.GetString() is { Length: > 0 } abstractText)
        {
            var abstractUrl = root.TryGetProperty("AbstractURL", out var auEl) ? auEl.GetString() ?? string.Empty : string.Empty;
            results.Add(new SearchResult("Summary", abstractUrl, abstractText));
        }

        if (root.TryGetProperty("Answer", out var answerEl) && answerEl.GetString() is { Length: > 0 } answer)
        {
            results.Add(new SearchResult("Answer", string.Empty, answer));
        }

        if (root.TryGetProperty("Results", out var resultsEl) && resultsEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var r in resultsEl.EnumerateArray())
            {
                AddResult(r, results);
            }
        }

        if (root.TryGetProperty("RelatedTopics", out var relatedEl) && relatedEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var topic in relatedEl.EnumerateArray())
            {
                if (topic.ValueKind == JsonValueKind.Array)
                {
                    foreach (var sub in topic.EnumerateArray()) AddResult(sub, results);
                }
                else
                {
                    AddResult(topic, results);
                }
            }
        }

        return results;
    }

    private static void AddResult(JsonElement el, List<SearchResult> results)
    {
        var text = el.TryGetProperty("Text", out var textEl) ? textEl.GetString() ?? string.Empty : string.Empty;
        var url = el.TryGetProperty("FirstURL", out var urlEl) ? urlEl.GetString() ?? string.Empty : string.Empty;
        if (text.Length > 0) results.Add(new SearchResult(text, url, string.Empty));
    }

    private static string Extract(string block, string pattern) =>
        Regex.Match(block, pattern, RegexOptions.Singleline).Groups["v"].Value;

    private static string CleanTags(string html) =>
        Regex.Replace(html, "<[^>]+>", string.Empty);

    private sealed record SearchResult(string Title, string Url, string Snippet);
}
