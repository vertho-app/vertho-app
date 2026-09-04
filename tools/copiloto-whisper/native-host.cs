using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

internal static class VerthoWhisperNativeHost
{
    private const int MaximumMessageBytes = 1024 * 1024;

    public static int Main()
    {
        try
        {
            Stream input = Console.OpenStandardInput();
            byte[] sizeBytes = ReadExactly(input, 4);
            if (sizeBytes == null) return 1;

            int size = BitConverter.ToInt32(sizeBytes, 0);
            if (size <= 0 || size > MaximumMessageBytes)
            {
                WriteResponse(false, "mensagem inválida");
                return 1;
            }

            byte[] payloadBytes = ReadExactly(input, size);
            if (payloadBytes == null)
            {
                WriteResponse(false, "mensagem incompleta");
                return 1;
            }

            string payload = Encoding.UTF8.GetString(payloadBytes);

            // `status` existe porque a falha mais comum não é o host: é o servidor
            // subir e MORRER ao carregar o modelo. Sem isto a tela só sabe que o
            // WebSocket não abriu, e a mensagem culpava a permissão de rede local
            // enquanto a causa real estava escrita no log (04/09/2026: o antivírus
            // interceptando o processo lançado pela cadeia do navegador).
            if (Regex.IsMatch(payload, "\\\"type\\\"\\s*:\\s*\\\"status\\\"", RegexOptions.IgnoreCase))
            {
                WriteStatusResponse(ReadLastFailure());
                return 0;
            }

            if (!Regex.IsMatch(payload, "\\\"type\\\"\\s*:\\s*\\\"start\\\"", RegexOptions.IgnoreCase))
            {
                WriteResponse(false, "comando desconhecido");
                return 1;
            }

            string launcher = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launcher.ps1");
            if (!File.Exists(launcher))
            {
                throw new FileNotFoundException("launcher.ps1 não encontrado", launcher);
            }

            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string powershell = Path.Combine(programFiles, "PowerShell", "7", "pwsh.exe");
            if (!File.Exists(powershell)) powershell = "powershell.exe";

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = powershell;
            startInfo.Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File \"" + launcher + "\" -Silencioso";
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;
            // Não deixe o launcher nem o Python herdarem os pipes binários que o
            // Chrome usa para conversar com este host nativo.
            startInfo.RedirectStandardInput = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;

            Process process = Process.Start(startInfo);
            if (process == null)
            {
                throw new InvalidOperationException("não foi possível criar o iniciador");
            }
            process.StandardInput.Close();
            process.Dispose();

            WriteResponse(true, null);
            return 0;
        }
        catch (Exception error)
        {
            LogError(error);
            WriteResponse(false, error.Message);
            return 1;
        }
    }

    private static byte[] ReadExactly(Stream stream, int count)
    {
        byte[] buffer = new byte[count];
        int offset = 0;
        while (offset < count)
        {
            int read = stream.Read(buffer, offset, count - offset);
            if (read <= 0) return null;
            offset += read;
        }
        return buffer;
    }

    /// <summary>
    /// A última razão pela qual o servidor não subiu, tirada dos logs.
    /// </summary>
    /// <remarks>
    /// Lê o fim do arquivo, e não o começo: o traceback do Python termina na
    /// linha que interessa. O stdout entra como segunda opção porque o servidor
    /// imprime ali a tentativa de cada modelo, e é isso que distingue "falhou só
    /// em CUDA" de "falhou nos três" — a segunda aponta para fora do nosso código.
    /// </remarks>
    private static string ReadLastFailure()
    {
        string runtime = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".runtime");
        string[] arquivos = { "whisper.err.log", "launcher.err.log", "whisper.out.log" };
        foreach (string nome in arquivos)
        {
            try
            {
                string caminho = Path.Combine(runtime, nome);
                if (!File.Exists(caminho)) continue;
                string[] linhas = File.ReadAllLines(caminho);
                for (int i = linhas.Length - 1; i >= 0 && i >= linhas.Length - 40; i--)
                {
                    string linha = linhas[i].Trim();
                    if (linha.Length == 0) continue;
                    if (linha.StartsWith("File \"") || linha.StartsWith("Traceback")) continue;
                    if (linha.Contains("^^^")) continue;
                    return linha.Length > 400 ? linha.Substring(0, 400) : linha;
                }
            }
            catch
            {
                // Log ilegível não pode derrubar o status: seguir para o próximo.
            }
        }
        return null;
    }

    private static void WriteStatusResponse(string failure)
    {
        try
        {
            string json = failure == null
                ? "{\"ok\":true,\"failure\":null}"
                : "{\"ok\":true,\"failure\":\"" + EscapeJson(failure) + "\"}";
            byte[] body = Encoding.UTF8.GetBytes(json);
            byte[] size = BitConverter.GetBytes(body.Length);
            Stream output = Console.OpenStandardOutput();
            output.Write(size, 0, size.Length);
            output.Write(body, 0, body.Length);
            output.Flush();
        }
        catch
        {
            // Sem canal de saída não há o que reportar.
        }
    }

    private static void WriteResponse(bool ok, string error)
    {
        try
        {
            string json = ok
                ? "{\"ok\":true}"
                : "{\"ok\":false,\"error\":\"" + EscapeJson(error ?? "erro desconhecido") + "\"}";
            byte[] body = Encoding.UTF8.GetBytes(json);
            byte[] size = BitConverter.GetBytes(body.Length);
            Stream output = Console.OpenStandardOutput();
            output.Write(size, 0, size.Length);
            output.Write(body, 0, body.Length);
            output.Flush();
        }
        catch
        {
        }
    }

    private static string EscapeJson(string value)
    {
        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n");
    }

    private static void LogError(Exception error)
    {
        try
        {
            string runtime = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".runtime");
            Directory.CreateDirectory(runtime);
            File.WriteAllText(Path.Combine(runtime, "native-host.err.log"), error.ToString(), Encoding.UTF8);
        }
        catch
        {
        }
    }
}
