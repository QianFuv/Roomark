param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$binary = (Resolve-Path -LiteralPath $Executable).Path
$archivePath = [System.IO.Path]::GetFullPath($OutputPath)
$directory = [System.IO.Path]::GetFileNameWithoutExtension($archivePath)
$license = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../../LICENSE')).Path
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        [void]$archive.CreateEntry("$directory/")
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $binary, "$directory/roomark-client.exe", [System.IO.Compression.CompressionLevel]::Optimal
        )
        [void]$archive.CreateEntry("$directory/data/")
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $license, "$directory/LICENSE", [System.IO.Compression.CompressionLevel]::Optimal
        )
    }
    finally {
        $archive.Dispose()
    }
}
finally {
    $stream.Dispose()
}
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
