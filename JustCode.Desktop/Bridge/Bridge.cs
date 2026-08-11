using System.Text.Json;
using Avalonia.Controls;
using Avalonia.Threading;
using JustCode.Infrastructure;
using JustCode.Services;

namespace JustCode.Bridge;

internal sealed class Bridge
{
    private const int MaxToolOutputChars = 4000;

    private readonly NativeWebView _webView;
    private readonly LlmProviderService _llmProvider;
    private readonly SessionService _sessions;
    private readonly AppDataService _appData;
    private LocalServer? _server;
    private CancellationTokenSource? _activeStreamCts;

    public Bridge(NativeWebView webView, LlmProviderService llmProvider, SessionService sessions, AppDataService appData)
    {
        _webView = webView;
        _llmProvider = llmProvider;
        _sessions = sessions;
        _appData = appData;
    }

    public void Initialize(bool useDevServer)
    {
        _webView.WebMessageReceived += OnWebMessageReceived;
        _webView.NavigationCompleted += OnNavigationCompleted;

        Uri url;
        if (useDevServer)
        {
            url = new Uri("http://localhost:1420/");
        }
        else
        {
            _server = new LocalServer(ResolveDistRoot());
            url = _server.Url;
        }

        _webView.Source = url;
    }

    private void OnNavigationCompleted(object? sender, WebViewNavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
            DebugLog.Write($"Navigation failed: request={e.Request}");
    }

    private static string ResolveDistRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (var i = 0; i < 5 && dir is not null; i++, dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "dist");
            if (File.Exists(Path.Combine(candidate, "index.html")))
                return candidate;
        }

        throw new InvalidOperationException("Could not locate the built frontend (dist/index.html). Run 'npm run build' first.");
    }

    private async void OnWebMessageReceived(object? sender, WebMessageReceivedEventArgs e)
    {
        Request? request;
        try
        {
            if (string.IsNullOrWhiteSpace(e.Body))
                return;

            request = JsonSerializer.Deserialize<Request>(e.Body, Json.Options);
        }
        catch (Exception ex)
        {
            DebugLog.Write($"WebMessageReceived parse error: {ex.Message}");
            Post(new Response { Kind = "response", Id = 0, Ok = false, Error = $"Bad message: {ex.Message}" });
            return;
        }

        if (request is null)
            return;

        object? data;
        try
        {
            data = await DispatchAsync(request.Id, request.Cmd, request.Args);
            Post(new Response { Kind = "response", Id = request.Id, Ok = true, Data = data });
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Dispatch error cmd={request.Cmd} id={request.Id}: {ex}");
            Post(new Response { Kind = "response", Id = request.Id, Ok = false, Error = ex.Message });
        }
    }

    private async Task<object?> DispatchAsync(int id, string cmd, JsonElement args)
    {
        switch (cmd)
        {
            case "get_app_data_dir":
                return _appData.Root;

            case "list_sessions":
                return _sessions.List();

            case "load_session":
                return _sessions.Load(args.GetProperty("id").GetString() ?? string.Empty);

            case "save_session":
            {
                var session = JsonSerializer.Deserialize<Session>(args.GetProperty("session").GetRawText(), Json.Options)
                    ?? throw new InvalidOperationException("Invalid session payload");
                _sessions.Save(session);
                return true;
            }

            case "delete_session":
                _sessions.Delete(args.GetProperty("id").GetString() ?? string.Empty);
                return true;

            case "chat_stream":
            {
                var history = args.GetProperty("history").EnumerateArray()
                    .Select(el => new ChatTurn(
                        el.GetProperty("role").GetString() ?? "user",
                        el.GetProperty("text").GetString() ?? string.Empty))
                    .ToList();
                var prompt = args.GetProperty("prompt").GetString() ?? string.Empty;
                var thinking = args.GetProperty("thinking").GetString() ?? "default";

                _llmProvider.ThinkingEffort = thinking;

                using var cts = new CancellationTokenSource();
                _activeStreamCts = cts;
                try
                {
                    await foreach (var chunk in _llmProvider.ChatStreamAsync(
                        history,
                        prompt,
                        onReasoningDelta: null,
                        onToolStatus: s => Post(new { kind = "tool_status", id, data = CapToolOutput(s) }),
                        cts.Token))
                    {
                        Post(new { kind = "chunk", id, data = chunk });
                    }

                    return "done";
                }
                catch (OperationCanceledException)
                {
                    DebugLog.Write($"Stream cancelled by user (id={id})");
                    return "cancelled";
                }
                finally
                {
                    _activeStreamCts = null;
                }
            }

            case "cancel_stream":
                _activeStreamCts?.Cancel();
                return true;

            default:
                throw new InvalidOperationException($"Unknown command: {cmd}");
        }
    }

    private static ToolStatus CapToolOutput(ToolStatus status)
    {
        if (status.Output is null || status.Output.Length <= MaxToolOutputChars)
            return status;

        return new ToolStatus(
            status.Name,
            status.Arguments,
            status.State,
            status.Output[..MaxToolOutputChars] + "\n\n...(output truncated)");
    }

    private void Post(object payload)
    {
        Dispatcher.UIThread.Post(async () =>
        {
            try
            {
                var json = JsonSerializer.Serialize(payload, Json.Options);
                await _webView.InvokeScript($"window.justcodePostMessage({json})");
            }
            catch (Exception ex)
            {
                DebugLog.Write($"Post to JS FAILED: {ex}");
            }
        });
    }

    private sealed class Request
    {
        public int Id { get; set; }
        public string Cmd { get; set; } = string.Empty;
        public JsonElement Args { get; set; }
    }

    private sealed class Response
    {
        public string Kind { get; set; } = "response";
        public int Id { get; set; }
        public bool Ok { get; set; }
        public object? Data { get; set; }
        public string? Error { get; set; }
    }
}