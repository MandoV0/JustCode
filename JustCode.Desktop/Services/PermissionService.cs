namespace JustCode.Services;

/// <summary>
/// Gates tool execution behind user approval. The frontend is notified via
/// a "tool_approval" message and answers with <see cref="Respond"/>.
/// </summary>
public sealed class PermissionService(Action<object> post)
{
    private const int ApprovalTimeoutSeconds = 30;

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _lock = new();
    private readonly Dictionary<int, TaskCompletionSource<bool>> _pending = [];
    private int _nextId;

    /// <summary>When true (YOLO mode), every approval request is granted immediately.</summary>
    public bool ApproveAll { get; set; }

    public async Task<bool> RequestAsync(string name, string arguments, CancellationToken cancellationToken)
    {
        if (ApproveAll)
            return true;

        await _gate.WaitAsync(cancellationToken);

        var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var id = Interlocked.Increment(ref _nextId);
        lock (_lock)
        {
            _pending[id] = tcs;
        }

        try
        {
            post(new { kind = "tool_approval", data = new { id, name, arguments } });

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(ApprovalTimeoutSeconds));

            return await tcs.Task.WaitAsync(timeoutCts.Token);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
        finally
        {
            lock (_lock)
            {
                _pending.Remove(id);
            }

            _gate.Release();
        }
    }

    public void Respond(int id, bool approved)
    {
        TaskCompletionSource<bool>? tcs;
        lock (_lock)
        {
            if (!_pending.TryGetValue(id, out tcs))
                return;
        }

        tcs.TrySetResult(approved);
    }
}
