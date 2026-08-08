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
    public List<SessionMessage> Messages { get; set; } = new();
}

internal sealed class SessionSummary
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public long UpdatedAt { get; set; }
    public int MessageCount { get; set; }
}

/// <summary>
/// One JSON file per chat session in <app data>/sessions/{id}.json.
/// </summary>
internal sealed class SessionService
{
    private readonly string _dir;

    public SessionService(AppDataService appData)
    {
        _dir = Path.Combine(appData.Root, "sessions");
        Directory.CreateDirectory(_dir);
    }

    public List<SessionSummary> List()
    {
        return Directory
            .EnumerateFiles(_dir, "*.json")
            .Select(path =>
            {
                try
                {
                    var session = JsonSerializer.Deserialize<Session>(File.ReadAllText(path), Json.Options);
                    if (session is null)
                    {
                        return null;
                    }
                    return new SessionSummary
                    {
                        Id = session.Id,
                        Title = session.Title,
                        UpdatedAt = session.UpdatedAt,
                        MessageCount = session.Messages.Count,
                    };
                }
                catch
                {
                    return null;
                }
            })
            .Where(s => s is not null)
            .OrderByDescending(s => s!.UpdatedAt)
            .Select(s => s!)
            .ToList();
    }

    public Session Load(string id)
    {
        var path = PathFor(id);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"Session '{id}' not found");
        }
        return JsonSerializer.Deserialize<Session>(File.ReadAllText(path), Json.Options)
            ?? throw new InvalidOperationException($"Session '{id}' could not be read");
    }

    public void Save(Session session)
    {
        var path = PathFor(session.Id);
        var temp = path + ".tmp";

        var json = JsonSerializer.Serialize(session, Json.Options);
        File.WriteAllText(temp, json);
        File.Move(temp, path, overwrite: true);
    }

    public void Delete(string id)
    {
        var path = PathFor(id);
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    private string PathFor(string id) => Path.Combine(_dir, $"{id}.json");
}
