using System.Net;
using System.Net.Sockets;
using System.Text;

namespace JustCode.Infrastructure;

/// <summary>
/// Static-file server used to serve the built React frontend in release builds.
/// Keeps the webview loading from http:// uniformly on every platform (Windows, Linux, MacOS).
/// </summary>
internal sealed class LocalServer : IDisposable
{
    private readonly HttpListener _listener = new();
    private readonly string _root;
    private bool _running = true;

    public int Port { get; }

    public LocalServer(string root)
    {
        _root = Path.GetFullPath(root);

        var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        Port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();

        _listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
        _listener.Start();
        _ = Task.Run(Loop);
    }

    public Uri Url => new($"http://127.0.0.1:{Port}/");

    private async Task Loop()
    {
        while (_running && _listener.IsListening)
        {
            HttpListenerContext ctx;
            try
            {
                ctx = await _listener.GetContextAsync();
            }
            catch
            {
                break;
            }

            _ = Task.Run(() => Serve(ctx));
        }
    }

    private void Serve(HttpListenerContext ctx)
    {
        var rawPath = ctx.Request.Url?.AbsolutePath ?? "/";
        try
        {
            var full = Resolve(rawPath.TrimStart('/'));
            var bytes = File.ReadAllBytes(full);

            ctx.Response.StatusCode = 200;
            ctx.Response.ContentType = MimeFor(full);
            ctx.Response.ContentLength64 = bytes.Length;
            ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            ctx.Response.OutputStream.Close();
        }
        catch (FileNotFoundException ex)
        {
            DebugLog.Write($"LocalServer 404 Not Found: {rawPath} ({ex.Message})");
            SendErrorResponse(ctx, HttpStatusCode.NotFound, "File Not Found");
        }
        catch (UnauthorizedAccessException ex)
        {
            DebugLog.Write($"LocalServer 403 Forbidden: {rawPath} ({ex.Message})");
            SendErrorResponse(ctx, HttpStatusCode.Forbidden, "Access Denied");
        }
        catch (Exception ex)
        {
            DebugLog.Write($"LocalServer 500 Internal Error serving {rawPath}: {ex}");
            SendErrorResponse(ctx, HttpStatusCode.InternalServerError, "Internal Server Error");
        }
    }

    private static void SendErrorResponse(HttpListenerContext ctx, HttpStatusCode status, string message)
    {
        try
        {
            ctx.Response.StatusCode = (int)status;
            var bytes = Encoding.UTF8.GetBytes(message);
            ctx.Response.ContentType = "text/plain; charset=utf-8";
            ctx.Response.ContentLength64 = bytes.Length;
            ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            ctx.Response.OutputStream.Close();
        }
        catch (Exception ex)
        {
            DebugLog.Write($"LocalServer failed to send error response: {ex.Message}");
        }
    }

    private string Resolve(string path)
    {
        var candidate = Path.GetFullPath(Path.Combine(_root, path));

        if (!candidate.StartsWith(_root, StringComparison.OrdinalIgnoreCase))
            throw new UnauthorizedAccessException($"Directory traversal blocked: {path}");

        if (File.Exists(candidate))
            return candidate;

        // SPA fallback for HTML navigation routes
        var ext = Path.GetExtension(path);
        if (string.IsNullOrEmpty(ext) || ext.Equals(".html", StringComparison.OrdinalIgnoreCase))
        {
            var indexPath = Path.Combine(_root, "index.html");
            if (File.Exists(indexPath))
                return indexPath;
        }

        throw new FileNotFoundException($"Resource not found: {path}");
    }

    private static string MimeFor(string path)
    {
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".html" => "text/html; charset=utf-8",
            ".js" => "text/javascript; charset=utf-8",
            ".mjs" => "text/javascript; charset=utf-8",
            ".css" => "text/css; charset=utf-8",
            ".json" => "application/json; charset=utf-8",
            ".svg" => "image/svg+xml",
            ".png" => "image/png",
            ".ico" => "image/x-icon",
            ".woff2" => "font/woff2",
            ".woff" => "font/woff",
            _ => "application/octet-stream",
        };
    }

    public void Dispose()
    {
        _running = false;
        try
        {
            _listener.Close();
        }
        catch (ObjectDisposedException)
        {
        }
    }
}