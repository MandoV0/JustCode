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
        _root = root;

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
        try
        {
            var path = ctx.Request.Url?.AbsolutePath.TrimStart('/') ?? string.Empty;
            var full = Resolve(path);

            var bytes = File.ReadAllBytes(full);
            ctx.Response.ContentType = MimeFor(full);
            ctx.Response.ContentLength64 = bytes.Length;
            ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            ctx.Response.OutputStream.Close();
        }
        catch
        {
            try
            {
                ctx.Response.StatusCode = 500;
                ctx.Response.Close();
            }
            catch
            {
                
            }
        }
    }

    private string Resolve(string path)
    {
        var root = Path.GetFullPath(_root);
        var candidate = Path.GetFullPath(Path.Combine(root, path));
        if (candidate.StartsWith(root, StringComparison.OrdinalIgnoreCase) && File.Exists(candidate))
        {
            return candidate;
        }

        // SPA fallback
        return Path.Combine(root, "index.html");
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
        catch
        {
            
        }
    }
}
