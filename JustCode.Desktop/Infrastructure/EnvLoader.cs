namespace JustCode.Infrastructure;

internal static class EnvLoader
{
    public static string? Get(string name)
    {
        LoadDotEnv();
        return Environment.GetEnvironmentVariable(name);
    }

    public static string Require(string name, string message)
    {
        var value = Get(name);
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(message);
        }
        return value;
    }

    private static bool _loaded;

    private static void LoadDotEnv()
    {
        if (_loaded)
        {
            return;
        }
        _loaded = true;

        var dir = new DirectoryInfo(Environment.CurrentDirectory);
        for (var i = 0; i < 5 && dir is not null; i++, dir = dir.Parent)
        {
            var path = Path.Combine(dir.FullName, ".env");
            if (!File.Exists(path))
            {
                continue;
            }

            foreach (var rawLine in File.ReadAllLines(path))
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith('#'))
                {
                    continue;
                }

                var idx = line.IndexOf('=');
                if (idx <= 0)
                {
                    continue;
                }

                var key = line[..idx].Trim();
                var value = line[(idx + 1)..].Trim().Trim('"', '\'');
                if (Environment.GetEnvironmentVariable(key) is null)
                {
                    Environment.SetEnvironmentVariable(key, value);
                }
            }

            return;
        }
    }
}