using Avalonia.Controls;
using JustCode.Bridge;
using JustCode.Services;

namespace JustCode;

public partial class MainWindow : Window
{
    private readonly Bridge.Bridge _bridge;

    public MainWindow()
    {
        InitializeComponent();

        var appData = new AppDataService();
        _bridge = new Bridge.Bridge(
            WebView,
            new GeminiService(),
            new SessionService(appData),
            appData);

        Opened += OnOpened;
    }

    private void OnOpened(object? sender, EventArgs e)
    {
#if DEBUG
        _bridge.Initialize(useDevServer: true);
#else
        _bridge.Initialize(useDevServer: false);
#endif
    }
}
