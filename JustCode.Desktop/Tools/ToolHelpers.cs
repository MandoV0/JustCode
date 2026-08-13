namespace JustCode.Tools;

public static class ToolHelpers
{
    private static readonly object MutationGate = new();
    private static readonly Dictionary<string, SemaphoreSlim> MutationLocks = new(PathKeyComparer);

    private static readonly StringComparer PathKeyComparer =
        OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;

    /// <summary>
    /// Serializes read-modify-write operations on a file path so concurrent tool calls
    /// targeting the same file cannot lose updates. The lock is keyed on the full path
    /// (case-insensitive on Windows) and must be held across the whole read->verify->write
    /// section. Entries are never evicted, which keeps serialization correct even when a
    /// waiter is still queued behind a released semaphore.
    /// </summary>
    /// <param name="fullPath"> Absolute path to the file being mutated. </param>
    /// <param name="cancellationToken"> Token that aborts waiting for the lock. </param>
    /// <returns> A handle that releases the lock when disposed. </returns>
    public static async Task<IDisposable> LockFileAsync(string fullPath, CancellationToken cancellationToken)
    {
        var key = Path.GetFullPath(fullPath);

        SemaphoreSlim semaphore;
        lock (MutationGate)
        {
            if (!MutationLocks.TryGetValue(key, out semaphore!))
            {
                semaphore = new SemaphoreSlim(1, 1);
                MutationLocks[key] = semaphore;
            }
        }

        await semaphore.WaitAsync(cancellationToken);

        return new FileLockHandle(semaphore);
    }

    private sealed class FileLockHandle : IDisposable
    {
        private readonly SemaphoreSlim _semaphore;
        private int _released;

        public FileLockHandle(SemaphoreSlim semaphore) => _semaphore = semaphore;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _released, 1) == 0)
            {
                _semaphore.Release();
            }
        }
    }
}
