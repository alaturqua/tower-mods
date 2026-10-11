# Ask for a folder with Windows' own Explorer-style dialog (address bar, search, quick
# access), the one apps use, not .NET's old tree view. It is owned by the window in front,
# the browser the click came from, so it opens over it. Prints the chosen path; prints
# nothing when cancelled. TOWER_PICK_COMPILE, when set, only checks that the code compiles.
$ErrorActionPreference = 'Stop'
$source = @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
class FileOpenDialogCoClass {}

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItem {
  void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
  void GetParent(out IShellItem ppsi);
  void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
}

// IFileDialog, in vtable order up to GetResult (IModalWindow's Show comes first).
[ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFileDialog {
  [PreserveSig] int Show(IntPtr parent);
  void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
  void SetFileTypeIndex(uint iFileType);
  void GetFileTypeIndex(out uint piFileType);
  void Advise(IntPtr pfde, out uint pdwCookie);
  void Unadvise(uint dwCookie);
  void SetOptions(uint fos);
  void GetOptions(out uint pfos);
  void SetDefaultFolder(IShellItem psi);
  void SetFolder(IShellItem psi);
  void GetFolder(out IShellItem ppsi);
  void GetCurrentSelection(out IShellItem ppsi);
  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
  void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
  void GetResult(out IShellItem ppsi);
}

public static class TowerFolderPicker {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  const uint FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40, FOS_PATHMUSTEXIST = 0x800;
  const uint SIGDN_FILESYSPATH = 0x80058000;

  public static string Pick(string title) {
    var dialog = (IFileDialog)new FileOpenDialogCoClass();
    dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
    dialog.SetTitle(title);
    dialog.SetOkButtonLabel("Add repository");
    if (dialog.Show(GetForegroundWindow()) != 0) return null;
    IShellItem item;
    dialog.GetResult(out item);
    string path;
    item.GetDisplayName(SIGDN_FILESYSPATH, out path);
    return path;
  }
}
'@
Add-Type -TypeDefinition $source
if ($env:TOWER_PICK_COMPILE) { 'compiles'; exit 0 }
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$path = [TowerFolderPicker]::Pick('Choose a git repository for Tower')
if ($path) { [Console]::Out.Write($path) }
