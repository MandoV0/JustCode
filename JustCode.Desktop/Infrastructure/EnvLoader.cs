namespace JustCode.Infrastructure;

internal static class EnvLoader
{
    private static bool _loaded;

    public static string? Get(string name)
    {
        EnsureLoaded();
        return Environment.GetEnvironmentVariable(name);
    }

    public static string Require(string name)
    {
        var value = Get(name);

        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException(
                $"Required environment variable '{name}' is missing.");

        return value;
    }

    private static void EnsureLoaded()
    {
        if (_loaded)
        {
            return;
        }
        _loaded = true;

        try
        {
            DotNetEnv.Env.TraversePath().Load();
        }
        catch (Exception ex)
        {
            DebugLog.Write($"DotNetEnv load warning: {ex.Message}");
        }
    }
}