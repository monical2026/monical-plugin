using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text.RegularExpressions;
using System.Windows.Forms;

[DataContract]
public class Request {
    [DataMember] public string operation;
    [DataMember] public string account;
    [DataMember] public string secret;
}
[DataContract]
public class Response {
    [DataMember(EmitDefaultValue=false)] public string secret;
    [DataMember(EmitDefaultValue=false)] public string error;
    [DataMember(EmitDefaultValue=false)] public string folder;
    [DataMember(EmitDefaultValue=false)] public bool saved;
    [DataMember(EmitDefaultValue=false)] public bool missing;
    [DataMember(EmitDefaultValue=false)] public bool cancelled;
}
public class Host {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct Credential {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CredWrite(ref Credential credential, uint flags);
    [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("advapi32.dll")] static extern void CredFree(IntPtr credential);

    static Response Credentials() {
        byte[] input;
        using (var buffer = new MemoryStream()) {
            var stream = Console.OpenStandardInput();
            var block = new byte[4096];
            int length;
            while ((length = stream.Read(block, 0, block.Length)) > 0) {
                if (buffer.Length + length > 65536) throw new Exception();
                buffer.Write(block, 0, length);
            }
            input = buffer.ToArray();
        }
        Request request;
        try {
            using (var stream = new MemoryStream(input)) {
                request = (Request)new DataContractJsonSerializer(typeof(Request)).ReadObject(stream);
            }
        } finally { Array.Clear(input, 0, input.Length); }
        if (request == null || request.account == null ||
            !Regex.IsMatch(request.account, @"\A[a-zA-Z0-9_-]{1,100}\z"))
            return new Response { error = "凭据请求格式错误" };
        string target = "com.youtube-note.credentials/" + request.account;
        if (request.operation == "get") {
            IntPtr pointer;
            if (!CredRead(target, 1, 0, out pointer)) {
                return Marshal.GetLastWin32Error() == 1168
                    ? new Response { missing = true }
                    : new Response { error = "Windows 凭据读取失败" };
            }
            try {
                var value = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
                if (value.CredentialBlobSize > 2560 || value.CredentialBlobSize % 2 != 0)
                    return new Response { error = "Windows 凭据格式错误" };
                return new Response { secret = Marshal.PtrToStringUni(value.CredentialBlob, (int)value.CredentialBlobSize / 2) };
            } finally { CredFree(pointer); }
        }
        if (request.operation != "set" || String.IsNullOrEmpty(request.secret))
            return new Response { error = "不支持的凭据操作" };
        byte[] bytes = Encoding.Unicode.GetBytes(request.secret);
        // Windows 通用凭据的最大数据长度为 2560 字节；不降级保存到普通文件。
        if (bytes.Length > 2560) {
            Array.Clear(bytes, 0, bytes.Length);
            return new Response { error = "密钥超过 Windows 凭据长度限制" };
        }
        IntPtr blob = Marshal.AllocHGlobal(bytes.Length);
        try {
            Marshal.Copy(bytes, 0, blob, bytes.Length);
            var value = new Credential {
                Type = 1, TargetName = target, CredentialBlobSize = (uint)bytes.Length,
                CredentialBlob = blob, Persist = 2, UserName = "VideoNote"
            };
            return CredWrite(ref value, 0)
                ? new Response { saved = true }
                : new Response { error = "Windows 凭据写入失败" };
        } finally {
            Array.Clear(bytes, 0, bytes.Length);
            Marshal.Copy(bytes, 0, blob, bytes.Length);
            Marshal.FreeHGlobal(blob);
        }
    }
    static Response ChooseFolder() {
        using (var dialog = new FolderBrowserDialog()) {
            dialog.Description = "选择 Obsidian 知识库或其中用于存放视频笔记的文件夹";
            dialog.ShowNewFolderButton = true;
            return dialog.ShowDialog() == DialogResult.OK
                ? new Response { folder = dialog.SelectedPath }
                : new Response { cancelled = true };
        }
    }
    static int Launch(string[] args) {
        // 只接受 Chrome 传入的扩展来源；host.mjs 再核对注册的 allowed_origins。
        if (args.Length == 0 || !Regex.IsMatch(args[0], @"\Achrome-extension://[a-p]{32}/\z"))
            throw new Exception();
        string root = AppDomain.CurrentDomain.BaseDirectory;
        var info = new ProcessStartInfo {
            FileName = Path.Combine(root, "node.exe"),
            Arguments = "host.mjs " + args[0],
            WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
        };
        using (var child = Process.Start(info)) {
            // 直接转发二进制流，不能经文本编码破坏 Native Messaging 的长度头。
            var input = Console.OpenStandardInput().CopyToAsync(child.StandardInput.BaseStream);
            input.ContinueWith(task => {
                try { child.StandardInput.Close(); } catch (InvalidOperationException) { }
                if (task.IsFaulted) { var ignored = task.Exception; }
            });
            var output = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
            var errors = child.StandardError.BaseStream.CopyToAsync(Stream.Null);
            child.WaitForExit();
            output.GetAwaiter().GetResult();
            errors.GetAwaiter().GetResult();
            return child.ExitCode;
        }
    }
    [STAThread]
    public static int Main(string[] args) {
        bool helper = args.Length == 1 && (args[0] == "--credentials" || args[0] == "--folder");
        try {
            if (!helper) return Launch(args);
            Response result = args[0] == "--credentials" ? Credentials() : ChooseFolder();
            new DataContractJsonSerializer(typeof(Response)).WriteObject(Console.OpenStandardOutput(), result);
            return 0;
        } catch {
            // 错误详情可能包含路径、请求或密钥，仅返回固定提示。
            if (helper) {
                new DataContractJsonSerializer(typeof(Response)).WriteObject(Console.OpenStandardOutput(),
                    new Response { error = "Windows 本机操作失败" });
            } else Console.Error.WriteLine("本机组件启动失败，请重新安装");
            return 1;
        }
    }
}
