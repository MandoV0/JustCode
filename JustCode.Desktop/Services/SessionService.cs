using System.Text.Json;
using JustCode.Infrastructure;

namespace JustCode.Services;

internal sealed record SessionMessage(string Id, string Role, string Text);

internal sealed class Session
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public long CreatedAt { get; set; }
    public long UpdatedAt { get; set; }
    public List<SessionMessage> Messages { get; set; } = [];
}

internal sealed class SessionSummary
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public long UpdatedAt { get; set; }
    public int MessageCount { get; set; }
}

/// <summary>One JSON file per chat session in %AppData%/Roaming/JustCode/sessions/{id}.json.</summary>
internal sealed class SessionService
{
    private readonly string _dir;

    public SessionService(AppDataService appData)
    {
        _dir = Path.Combine(appData.Root, "sessions");
        Directory.CreateDirectory(_dir);
    }

    public List<SessionSummary> List() =>
        Directory.EnumerateFiles(_dir, "*.json")
            .Select(path =>
            {
                try
                {
                    var s = JsonSerializer.Deserialize<Session>(File.ReadAllText(path), Json.Options);
                    return s is null ? null : new SessionSummary
                    {
                        Id = s.Id,
                        Title = s.Title,
                        UpdatedAt = s.UpdatedAt,
                        MessageCount = s.Messages.Count,
                    };
                }
                catch (Exception ex)
                {
                    DebugLog.Write($"Failed to read session '{path}': {ex.Message}");
                    return null;
                }
            })
            .OfType<SessionSummary>()
            .OrderByDescending(s => s.UpdatedAt)
            .ToList();

    public Session Load(string id)
    {
        var path = PathFor(id);
        return JsonSerializer.Deserialize<Session>(File.ReadAllText(path), Json.Options)
            ?? throw new InvalidOperationException($"Session '{id}' could not be read.");
    }

    public void Save(Session session)
    {
        var path = PathFor(session.Id);
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(session, Json.Options));
        File.Move(temp, path, overwrite: true);
    }


    public void Delete(string id)
    {
        var path = PathFor(id);
        if (File.Exists(path)) File.Delete(path);
    }

    private string PathFor(string id) => Path.Combine(_dir, $"{id}.json");
}