using System.Text.Json;
using Avalonia.Controls;
using Avalonia.Threading;
using JustCode.Infrastructure;
using JustCode.Services;

namespace JustCode.Bridge;

/// <summary>
/// Bidirectional messaging bridge between the web frontend and the C# backend.
/// JS -> C#:  invokeCSharpAction(JSON.stringify({ id, cmd, args }))   (injected by Avalonia.Controls.WebView)
/// C# -> JS:  window.justcodePostMessage({ kind: "response", id, ok, data | error })
/// </summary>
internal sealed class Bridge
{
    private readonly NativeWebView _webView;
    private readonly GeminiService _gemini;
    private readonly SessionService _sessions;
    private readonly AppDataService _appData;
    private LocalServer? _server;

    public Bridge(NativeWebView webView, GeminiService gemini, SessionService sessions, AppDataService appData)
    {
        _webView = webView;
        _gemini = gemini;
        _sessions = sessions;
        _appData = appData;
    }

    public void Initialize(bool useDevServer)
    {
        _webView.WebMessageReceived += OnWebMessageReceived;
        _webView.NavigationCompleted += OnNavigationCompleted;
        DebugLog.Write($"Bridge.Initialize(useDevServer={useDevServer})");

        Uri url;
        if (useDevServer)
        {
            url = new Uri("http://localhost:1420/");
        }
        else
        {
            var dist = ResolveDistRoot();
            _server = new LocalServer(dist);
            url = _server.Url;
        }

        DebugLog.Write($"Bridge navigating to {url}");
        _webView.Source = url;
    }

    private void OnNavigationCompleted(object? sender, WebViewNavigationCompletedEventArgs e)
    {
        DebugLog.Write($"NavigationCompleted request={e.Request} success={e.IsSuccess}");
    }

    private static string ResolveDistRoot()
    {
        var root = AppContext.BaseDirectory;
        var dir = new DirectoryInfo(root);
        for (var i = 0; i < 5 && dir is not null; i++, dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "dist");
            if (File.Exists(Path.Combine(candidate, "index.html")))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException("Could not locate the built frontend (dist/index.html). Run 'npm run build' first.");
    }

    private async void OnWebMessageReceived(object? sender, WebMessageReceivedEventArgs e)
    {
        Request? request;
        try
        {
            var json = e.Body;
            DebugLog.Write($"WebMessageReceived body={json}");
            if (string.IsNullOrWhiteSpace(json))
            {
                return;
            }
            request = JsonSerializer.Deserialize<Request>(json, Json.Options);
        }
        catch (Exception ex)
        {
            DebugLog.Write($"WebMessageReceived parse error: {ex.Message}");
            Post(new Response { Kind = "response", Id = 0, Ok = false, Error = $"Bad message: {ex.Message}" });
            return;
        }

        if (request is null)
        {
            DebugLog.Write("WebMessageReceived: request is null");
            return;
        }

        DebugLog.Write($"Dispatch start cmd={request.Cmd} id={request.Id}");
        object? data;
        try
        {
            data = await DispatchAsync(request.Cmd, request.Args);
            DebugLog.Write($"Dispatch done cmd={request.Cmd} id={request.Id}");
            Post(new Response { Kind = "response", Id = request.Id, Ok = true, Data = data });
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Dispatch error cmd={request.Cmd} id={request.Id}: {ex}");
            Post(new Response { Kind = "response", Id = request.Id, Ok = false, Error = ex.Message });
        }
    }

    private async Task<object?> DispatchAsync(string cmd, JsonElement args)
    {
        switch (cmd)
        {
            case "get_app_data_dir":
                return _appData.Root;

            case "chat_with_gemini":
            {
                var history = args.GetProperty("history").EnumerateArray()
                    .Select(el => new ChatTurn(
                        el.GetProperty("role").GetString() ?? "user",
                        el.GetProperty("text").GetString() ?? string.Empty))
                    .ToList();
                var prompt = args.GetProperty("prompt").GetString() ?? string.Empty;
                return await _gemini.ChatAsync(history, prompt);
            }

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

            default:
                throw new InvalidOperationException($"Unknown command: {cmd}");
        }
    }

    private void Post(object payload)
    {
        Dispatcher.UIThread.Post(async () =>
        {
            try
            {
                var json = JsonSerializer.Serialize(payload, Json.Options);
                var result = await _webView.InvokeScript($"window.justcodePostMessage({json})");
                DebugLog.Write($"Post to JS ok, invoke result len={result?.Length ?? -1}");
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