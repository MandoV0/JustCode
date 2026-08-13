namespace JustCode.Infrastructure;

/// <summary>
/// Shared output truncation for tool results that exceed size limits.
/// Head keeps the beginning of the output, Tail keeps the end (useful for
/// command output where errors appear last).
/// </summary>
internal static class OutputTruncator
{
    private const string TruncatedMarker = "\n\n…(output truncated)";

    public static string Head(string text, int maxChars)
    {
        if (text.Length <= maxChars) return text;
        return text[..maxChars] + TruncatedMarker;
    }

    public static string Tail(string text, int maxChars)
    {
        if (text.Length <= maxChars) return text;
        return "…(output truncated)\n\n" + text[^maxChars..];
    }
}
