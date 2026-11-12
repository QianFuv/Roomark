param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$binary = (Resolve-Path -LiteralPath $Executable).Path
$archivePath = [System.IO.Path]::GetFullPath($OutputPath)
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $binary, 'Roomark/roomark.exe', [System.IO.Compression.CompressionLevel]::Optimal
        )
        [void]$archive.CreateEntry('Roomark/data/')
    }
    finally {
        $archive.Dispose()
    }
}
finally {
    $stream.Dispose()
}
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
