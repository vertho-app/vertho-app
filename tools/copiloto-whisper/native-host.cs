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
