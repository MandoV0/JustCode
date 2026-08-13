using System.Text;
using System.Text.Json;
using Avalonia.Controls;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using JustCode.Infrastructure;
using JustCode.Services;
using JustCode.Tools;

namespace JustCode.Bridge;

internal sealed class Bridge
{
    private readonly NativeWebView _webView;
    private readonly List<ITool> _tools;
    private readonly SessionService _sessions;
    private readonly AppDataService _appData;
    private readonly ApiConfigService _apiConfigs;
    private readonly ProjectService _projects;
    private readonly PermissionService _permissions;
    private readonly AgentProcessor _agents;
    private LocalServer? _server;

    public Bridge(NativeWebView webView, List<ITool> tools, SessionService sessions, AppDataService appData, ApiConfigService apiConfigs, ProjectService projects)
    {
        _webView = webView;
        _tools = tools;
        _sessions = sessions;
        _appData = appData;
        _apiConfigs = apiConfigs;
        _projects = projects;
        _permissions = new PermissionService(Post);
        _agents = new AgentProcessor(apiConfigs, projects, tools, _permissions);
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

            case "list_api_configs":
                return _apiConfigs.List();

            case "get_active_api_config":
                return _apiConfigs.ActiveId;

            case "save_api_config":
            {
                var config = JsonSerializer.Deserialize<ApiConfig>(args.GetProperty("config").GetRawText(), Json.Options)
                    ?? throw new InvalidOperationException("Invalid API config payload");
                _apiConfigs.Upsert(config);
                return _apiConfigs.List();
            }

            case "delete_api_config":
            {
                var configId = args.GetProperty("id").GetString() ?? string.Empty;
                _apiConfigs.Delete(configId);
                return _apiConfigs.List();
            }

            case "set_active_api_config":
            {
                var configId = args.GetProperty("id").GetString();
                if (!string.IsNullOrWhiteSpace(configId)) _apiConfigs.SetActive(configId);
                return _apiConfigs.ActiveId;
            }

            case "list_projects":
                return _projects.List();

            case "pick_folder":
                return await PickFolderAsync();

            case "get_active_project":
                return _projects.ActiveId;

            case "save_project":
            {
                var project = JsonSerializer.Deserialize<Project>(args.GetProperty("project").GetRawText(), Json.Options)
                    ?? throw new InvalidOperationException("Invalid project payload");
                _projects.Save(project);
                return _projects.List();
            }

            case "delete_project":
            {
                var projectId = args.GetProperty("id").GetString() ?? string.Empty;
                _projects.Delete(projectId);
                return _projects.List();
            }

            case "set_active_project":
            {
                var projectId = args.GetProperty("id").GetString();
                if (!string.IsNullOrWhiteSpace(projectId)) _projects.SetActive(projectId);
                return _projects.ActiveId;
            }

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

            case "rename_session":
            {
                var sessionId = args.GetProperty("id").GetString() ?? string.Empty;
                var title = args.GetProperty("title").GetString() ?? string.Empty;
                _sessions.Rename(sessionId, title);
                return true;
            }

            case "chat_stream":
            {
                var agentId = args.GetProperty("agentId").GetString() ?? string.Empty;
                var history = ParseHistory(args);
                var prompt = args.GetProperty("prompt").GetString() ?? string.Empty;
                var thinking = args.GetProperty("thinking").GetString() ?? "default";
                var configId = args.TryGetProperty("configId", out var configProp)
                    ? configProp.GetString()
                    : null;
                var projectId = args.TryGetProperty("projectId", out var projectProp)
                    ? projectProp.GetString()
                    : null;

                if (string.IsNullOrWhiteSpace(agentId))
                    throw new InvalidOperationException("chat_stream requires an agentId.");

                return await _agents.RunAsync(
                    agentId,
                    history,
                    prompt,
                    thinking,
                    configId,
                    projectId,
                    onChunk: c => Post(new { kind = "chunk", id, data = c }),
                    onToolStatus: s => Post(new { kind = "tool_status", id, data = s }),
                    onReasoningDelta: d => Post(new { kind = "reasoning_chunk", id, data = d }));
            }

            case "cancel_stream":
            {
                var agentId = args.GetProperty("agentId").GetString() ?? string.Empty;
                _agents.Cancel(agentId);
                return true;
            }

            case "set_yolo_mode":
            {
                var enabled = args.GetProperty("enabled").GetBoolean();
                _permissions.ApproveAll = enabled;
                return true;
            }

            case "respond_tool_approval":
            {
                var approvalId = args.GetProperty("id").GetInt32();
                var approved = args.GetProperty("approved").GetBoolean();
                _permissions.Respond(approvalId, approved);
                return true;
            }

            default:
                throw new InvalidOperationException($"Unknown command: {cmd}");
        }
    }

    private async Task<string?> PickFolderAsync()
    {
        var topLevel = TopLevel.GetTopLevel(_webView);
        if (topLevel is null)
        {
            throw new InvalidOperationException("No active window for the folder picker.");
        }

        return await Dispatcher.UIThread.InvokeAsync(async () =>
        {
            var folders = await topLevel.StorageProvider.OpenFolderPickerAsync(new FolderPickerOpenOptions
            {
                Title = "Select project folder",
                AllowMultiple = false,
            });

            return folders.Count > 0 ? folders[0].Path.LocalPath : null;
        });
    }

    private static List<ChatTurn> ParseHistory(JsonElement args)
    {
        if (!args.TryGetProperty("history", out var history) || history.ValueKind != JsonValueKind.Array)
            return [];

        return history.EnumerateArray()
            .Select(BuildTurn)
            .ToList();
    }

    private static ChatTurn BuildTurn(JsonElement el)
    {
        var role = el.TryGetProperty("role", out var roleProp) ? roleProp.GetString() ?? "user" : "user";
        var text = el.TryGetProperty("text", out var textProp) ? textProp.GetString() ?? string.Empty : string.Empty;
        var blocks = el.TryGetProperty("blocks", out var blocksProp) && blocksProp.ValueKind == JsonValueKind.Array
            ? blocksProp.EnumerateArray().ToList()
            : null;

        string? reasoning = null;
        if (role == "assistant" && blocks is not null)
        {
            var sb = new StringBuilder();
            foreach (var block in blocks)
            {
                if (block.ValueKind == JsonValueKind.Object
                    && block.TryGetProperty("type", out var typeEl)
                    && typeEl.GetString() == "thinking"
                    && block.TryGetProperty("text", out var thinkingText))
                {
                    sb.Append(thinkingText.GetString());
                }
            }
            if (sb.Length > 0) reasoning = sb.ToString();
        }

        return new ChatTurn(role, text, reasoning, blocks);
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