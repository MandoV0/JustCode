using System.Text.Json;
using JustCode.Infrastructure;

namespace JustCode.Services;

/// <summary>A user-defined LLM provider configuration (add/edit/delete via the Settings UI).</summary>
public sealed class ApiConfig
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public bool EnableThinking { get; set; }
    public bool StrictMode { get; set; }
    public int MaxContextTokens { get; set; } = 64_000;
    public List<string> ThinkingOptions { get; set; } = [];
}

/// <summary>
/// Stores all API configurations in %AppData%/Roaming/JustCode/api-configs.json
/// and remembers the active configuration id in active-api-config.json.
/// </summary>
internal sealed class ApiConfigService
{
    private readonly string _configsPath;
    private readonly string _activePath;

    private List<ApiConfig> _configs = [];
    private string? _activeId;

    public ApiConfigService(AppDataService appData)
    {
        _configsPath = Path.Combine(appData.Root, "api-configs.json");
        _activePath = Path.Combine(appData.Root, "active-api-config.json");
        Load();
    }

    public IReadOnlyList<ApiConfig> List() => _configs;

    public string? ActiveId => _activeId;

    public ApiConfig? GetActive() =>
        _activeId is null ? null : _configs.FirstOrDefault(c => c.Id == _activeId);

    public ApiConfig? Get(string? id)
    {
        if (!string.IsNullOrWhiteSpace(id))
        {
            var match = _configs.FirstOrDefault(c => c.Id == id);
            if (match is not null) return match;
        }

        return GetActive();
    }

    public void Upsert(ApiConfig config)
    {
        var index = _configs.FindIndex(c => c.Id == config.Id);
        if (index >= 0)
        {
            _configs[index] = config;
        }
        else
        {
            _configs.Add(config);
            _activeId ??= config.Id;
        }

        Persist();
    }

    public void Delete(string id)
    {
        _configs.RemoveAll(c => c.Id == id);
        if (_activeId == id) _activeId = null;
        Persist();
    }

    public void SetActive(string id)
    {
        if (_configs.Any(c => c.Id == id) && _activeId != id)
        {
            _activeId = id;
            Persist();
        }
    }

    private void Load()
    {
        try
        {
            if (File.Exists(_configsPath))
            {
                _configs = JsonSerializer.Deserialize<List<ApiConfig>>(File.ReadAllText(_configsPath), Json.Options) ?? [];
            }

            if (File.Exists(_activePath))
            {
                var active = File.ReadAllText(_activePath).Trim();
                if (_configs.Any(c => c.Id == active)) _activeId = active;
            }
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Failed to load API configs: {ex.Message}");
        }
    }

    private void Persist()
    {
        try
        {
            File.WriteAllText(_configsPath, JsonSerializer.Serialize(_configs, Json.Options));
            File.WriteAllText(_activePath, _activeId ?? string.Empty);
        }
        catch (Exception ex)
        {
            DebugLog.Write($"Failed to save API configs: {ex.Message}");
        }
    }
}
