namespace JustCode.Infrastructure;

/// <summary>
/// Rough token estimation for context-budget trimming.
/// </summary>
internal static class TokenEstimator
{
    private const double Headroom = 1.15;

    /// <summary>
    /// Rough approximation: ~4 characters per token, scaled up by headroom
    /// to stay conservative when trimming conversation context.
    /// </summary>
    public static int Estimate(string text) => (int)Math.Ceiling(text.Length / 4.0 * Headroom);

    /// <summary>
    /// Estimates the token count of serialized messages, adding a fixed
    /// per-message overhead for role/JSON framing.
    /// </summary>
    public static int EstimateMessages(IEnumerable<string> serializedMessages) =>
        serializedMessages.Sum(serialized => Estimate(serialized) + 4);
}
