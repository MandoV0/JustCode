using Avalonia.Controls;
using JustCode.Services;
using JustCode.Tools;

namespace JustCode;

public partial class MainWindow : Window
{
    private readonly Bridge.Bridge _bridge;

    public MainWindow()
    {
        InitializeComponent();

        var appData = new AppDataService();
        var project = new ProjectService();

        List<ITool> tools =
        [
            new ReadFileTool(project),
            new ListDirTool(project),
            new EditFileTool(project),
            new SearchTool(project),
            new WriteTool(project),
            new BashTool(project),
            new WebSearchTool(),
            new WebFetchTool(),
        ];

        _bridge = new Bridge.Bridge(
            WebView,
            tools,
            new SessionService(appData),
            appData,
            new ApiConfigService(appData),
            project);

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
