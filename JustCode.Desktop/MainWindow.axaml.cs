using Avalonia.Controls;
using JustCode.Infrastructure;
using JustCode.Services;
using JustCode.Tools;

namespace JustCode;

public partial class MainWindow : Window
{
    private readonly Bridge.Bridge _bridge;

    public MainWindow()
    {
        InitializeComponent();

        List<ITool> tools = new List<ITool> { new ReadFileTool(), new ListDirTool(), new EditFileTool(), new SearchTool(), new WriteTool(), new BashTool() };

        var appData = new AppDataService();
        _bridge = new Bridge.Bridge(
            WebView,
            new OpenAIService(new OpenAiConfig
            {
                BaseUrl = "https://api.deepseek.com",
                ApiKey = EnvLoader.Get("DEEPSEEK_API_KEY"),
                Model = "deepseek-v4-flash"
            }, tools),
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
