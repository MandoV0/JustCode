namespace JustCode.Tools;

/// <summary>
/// Minimal line-based diff (LCS) used to show + / - change blocks for tool results.
/// </summary>
internal static class TextDiff
{
    private const int MaxMatrixCells = 2_000_000;

    /// <summary>Returns a list of diff lines ("add" / "del" / "ctx") between two texts.</summary>
    public static List<DiffLine> Lines(string before, string after, int maxLines = 200)
    {
        var a = Split(before);
        var b = Split(after);

        List<DiffLine> result;
        if ((long)a.Length * b.Length > MaxMatrixCells)
        {
            result = WholeReplace(a, b);
        }
        else
        {
            result = Lcs(a, b);
        }

        if (result.Count > maxLines)
        {
            result = result.Take(maxLines)
                .Append(new DiffLine("ctx", $"… {result.Count - maxLines} more line(s) omitted"))
                .ToList();
        }

        return result;
    }

    private static string[] Split(string text)
    {
        if (string.IsNullOrEmpty(text)) return [];
        return text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
    }

    private static List<DiffLine> WholeReplace(string[] a, string[] b)
    {
        var result = new List<DiffLine>(a.Length + b.Length);
        foreach (var line in a) result.Add(new DiffLine("del", line));
        foreach (var line in b) result.Add(new DiffLine("add", line));
        return result;
    }

    private static List<DiffLine> Lcs(string[] a, string[] b)
    {
        var n = a.Length;
        var m = b.Length;
        var prev = new int[m + 1];
        var curr = new int[m + 1];

        for (var i = 1; i <= n; i++)
        {
            for (var j = 1; j <= m; j++)
            {
                curr[j] = a[i - 1] == b[j - 1] ? prev[j - 1] + 1 : Math.Max(prev[j], curr[j - 1]);
            }
            (prev, curr) = (curr, prev);
        }

        var result = new List<DiffLine>(n + m);
        var x = n;
        var y = m;
        while (x > 0 && y > 0)
        {
            if (a[x - 1] == b[y - 1])
            {
                result.Add(new DiffLine("ctx", a[x - 1]));
                x--;
                y--;
            }
            else if (prev[y] >= curr[y - 1])
            {
                result.Add(new DiffLine("del", a[x - 1]));
                x--;
            }
            else
            {
                result.Add(new DiffLine("add", b[y - 1]));
                y--;
            }
        }
        while (x > 0)
        {
            result.Add(new DiffLine("del", a[x - 1]));
            x--;
        }
        while (y > 0)
        {
            result.Add(new DiffLine("add", b[y - 1]));
            y--;
        }

        result.Reverse();
        return result;
    }
}
