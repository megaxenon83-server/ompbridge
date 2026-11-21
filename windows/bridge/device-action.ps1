$ErrorActionPreference = 'Stop'
$request = ConvertFrom-Json $env:OMP_DEVICE_REQUEST
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class OmpDevice {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int limit);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint action, uint x, uint y, uint data, UIntPtr extra);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][OmpDevice]::SetProcessDPIAware()
for ($attempt = 0; $attempt -lt 24; $attempt++) {
    $handle = [OmpDevice]::GetForegroundWindow()
    $caption = [Text.StringBuilder]::new(512)
    [void][OmpDevice]::GetWindowText($handle, $caption, $caption.Capacity)
    $title = $caption.ToString()
    if ($request.action -eq 'foreground' -or $title -ceq $request.exactTitle) { break }
    Start-Sleep -Milliseconds 250
}
if (!$title) { throw 'Fant ikke et aktivt Windows-vindu.' }
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if ($request.action -eq 'foreground') { @{ title = $title } | ConvertTo-Json -Compress; exit }
if ($title -cne $request.exactTitle) { throw 'Aktivt vindu er endret. Velg ønsket vindu og prøv igjen.' }
$rect = New-Object OmpDevice+Rect
if (!([OmpDevice]::GetWindowRect($handle, [ref]$rect))) { throw 'Kunne ikke lese vinduets størrelse.' }
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0 -or $width -gt 8192 -or $height -gt 8192) { throw 'Vinduet har ugyldig størrelse.' }
switch ($request.action) {
    'screen' {
        $bitmap = [Drawing.Bitmap]::new($width, $height)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        $memory = [IO.MemoryStream]::new()
        try {
            $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
            $scale = [math]::Min(1, 1500.0/[math]::Max($width, $height))
            $image = [Drawing.Bitmap]::new($bitmap, [math]::Max(1,[int]($width*$scale)), [math]::Max(1,[int]($height*$scale)))
            try { $image.Save($memory, [Drawing.Imaging.ImageFormat]::Png) } finally { $image.Dispose() }
            @{ data = [Convert]::ToBase64String($memory.ToArray()) } | ConvertTo-Json -Compress
        } finally { $graphics.Dispose(); $bitmap.Dispose(); $memory.Dispose() }
        exit
    }
    'tap' {
        $x = $rect.Left + [math]::Floor($request.x * $width)
        $y = $rect.Top + [math]::Floor($request.y * $height)
        if ([OmpDevice]::GetForegroundWindow() -ne $handle -or ![OmpDevice]::SetCursorPos($x, $y)) { throw 'Vinduet mistet fokus.' }
        [OmpDevice]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
        [OmpDevice]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
    }
    'type' {
        $text = [regex]::Replace($request.text, '[+^%~(){}\[\]]', { param($match) '{' + $match.Value + '}' })
        if ([OmpDevice]::GetForegroundWindow() -ne $handle -or $text -match '[\r\n]') { throw 'Vinduet mistet fokus eller teksten har linjeskift.' }
        [Windows.Forms.SendKeys]::SendWait($text)
    }
    'key' {
        if ([OmpDevice]::GetForegroundWindow() -ne $handle) { throw 'Vinduet mistet fokus.' }
        [Windows.Forms.SendKeys]::SendWait($request.systemKey)
    }
    default { throw 'Ukjent handling.' }
}
Write-Output '{}'
