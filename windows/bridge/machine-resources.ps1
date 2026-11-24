$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class OmpDxgi {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct Desc {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Name;
        public uint Vendor, Device, Subsystem, Revision;
        public UIntPtr Dedicated, System, Shared;
        public uint Low, High, Flags;
    }
    [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid iid, out IntPtr factory);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EnumAdapter(IntPtr self, uint index, out IntPtr adapter);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetDesc(IntPtr self, out Desc desc);
    static Delegate Method(IntPtr p, int slot, Type type) {
        return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(p), slot * IntPtr.Size), type);
    }
    public class Adapter { public string Name, Luid; public UInt64 Total; public uint Vendor; }
    public static Adapter[] List() {
        var result = new List<Adapter>();
        Guid iid = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
        IntPtr factory;
        Marshal.ThrowExceptionForHR(CreateDXGIFactory1(ref iid, out factory));
        try {
            var next = (EnumAdapter)Method(factory, 12, typeof(EnumAdapter));
            for (uint i = 0; i < 64; i++) {
                IntPtr adapter;
                if (next(factory, i, out adapter) != 0) break;
                try {
                    Desc desc;
                    if (((GetDesc)Method(adapter, 10, typeof(GetDesc)))(adapter, out desc) == 0 && (desc.Flags & 2) == 0)
                        result.Add(new Adapter { Name=desc.Name, Vendor=desc.Vendor, Total=desc.Dedicated.ToUInt64(),
                            Luid=String.Format("luid_0x{0:X8}_0x{1:X8}", desc.High, desc.Low) });
                } finally { Marshal.Release(adapter); }
            }
        } finally { Marshal.Release(factory); }
        return result.ToArray();
    }
}
'@
$adapters = [OmpDxgi]::List()
$cpuName = (Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name) -join ' / '
$ram = [long](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$installed = [long]((Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue | Measure-Object Capacity -Sum).Sum)
if ($installed -le 0) { $installed = $ram }
while ($null -ne [Console]::ReadLine()) {
    try {
        $cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction SilentlyContinue
        $mem = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -ErrorAction SilentlyContinue
        $memory = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -ErrorAction SilentlyContinue
        $engines = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue
        $gpus = foreach ($adapter in $adapters) {
            $used = $memory | Where-Object { $_.Name -like "$($adapter.Luid)*" } | Select-Object -First 1
            $load = $engines | Where-Object { $_.Name -like "*$($adapter.Luid)*" } |
                Group-Object { $_.Name -replace '^pid_\d+_', '' } | ForEach-Object {
                    ($_.Group | Measure-Object -Property UtilizationPercentage -Sum).Sum
                } | Measure-Object -Maximum
            [ordered]@{
                name=$adapter.Name; vendor=$adapter.Vendor; total=if($adapter.Total -gt 0){$adapter.Total}else{$null}
                used=if($used){[long]$used.DedicatedUsage}else{$null}
                load=if($load.Count){[Math]::Min(100,$load.Maximum)}else{$null}
                temperature=$null
            }
        }
        $available=if($mem){[long]$mem.AvailableBytes}else{$null}
        @{cpu=@{name=$cpuName;load=if($cpu){[double]$cpu.PercentProcessorTime}else{$null}}
          ram=@{total=$installed;usable=$ram;available=$available};gpus=@($gpus | Where-Object {$_})} | ConvertTo-Json -Depth 5 -Compress
    } catch { '{"error":"Windows kunne ikke lese maskinmålingene."}' }
}
