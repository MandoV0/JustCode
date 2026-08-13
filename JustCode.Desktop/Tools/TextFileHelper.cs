using System.Text;

namespace JustCode.Tools;

internal readonly record struct TextFileContent(
    string Text,
    bool HasUtf8Bom,
    string LineEnding);

internal static class TextFileHelper
{
    private static readonly byte[] Utf8Bom = [0xEF, 0xBB, 0xBF];

    public static async Task<TextFileContent> ReadAsync(
        string path,
        CancellationToken cancellationToken)
    {
        var bytes = await File.ReadAllBytesAsync(path, cancellationToken);

        var hasBom = HasUtf8Bom(bytes);
        var offset = hasBom ? Utf8Bom.Length : 0;

        var text = Encoding.UTF8.GetString(
            bytes,
            offset,
            bytes.Length - offset);

        var lineEnding = DetectLineEnding(text);

        return new TextFileContent(text, hasBom, lineEnding);
    }

    public static async Task WriteAsync(
        string path,
        string text,
        bool hasUtf8Bom,
        CancellationToken cancellationToken)
    {
        var content = Encoding.UTF8.GetBytes(text);

        if (!hasUtf8Bom)
        {
            await File.WriteAllBytesAsync(path, content, cancellationToken);
            return;
        }

        var output = new byte[Utf8Bom.Length + content.Length];

        Utf8Bom.CopyTo(output, 0);
        content.CopyTo(output, Utf8Bom.Length);

        await File.WriteAllBytesAsync(path, output, cancellationToken);
    }

    public static bool HasUtf8Bom(ReadOnlySpan<byte> bytes)
    {
        return bytes.Length >= 3
            && bytes[0] == 0xEF
            && bytes[1] == 0xBB
            && bytes[2] == 0xBF;
    }

    /// <summary>Reads only the first few bytes of a file to check for a UTF-8 BOM.</summary>
    public static async Task<bool> HasUtf8BomAsync(
        string path,
        CancellationToken cancellationToken)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        var head = new byte[Utf8Bom.Length];
        var read = await stream.ReadAsync(head.AsMemory(), cancellationToken);
        return read >= Utf8Bom.Length && HasUtf8Bom(head);
    }

    /// <summary>Normalizes line endings to the given style, handling CRLF and lone CR.</summary>
    public static string ConvertLineEndings(string text, string lineEnding)
    {
        var normalized = text.Replace("\r\n", "\n").Replace('\r', '\n');
        return lineEnding == "\r\n" ? normalized.Replace("\n", "\r\n") : normalized;
    }

    private static string DetectLineEnding(string text)
    {
        return text.Contains("\r\n", StringComparison.Ordinal)
            ? "\r\n"
            : "\n";
    }
}
