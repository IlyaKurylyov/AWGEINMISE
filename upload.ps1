$ftpUrl = "ftp://31.31.197.45:21"
$user = "u3157398"
$pass = "v5Hz1CblGOBZSh85"

$webclient = New-Object System.Net.WebClient
$webclient.Credentials = New-Object System.Net.NetworkCredential($user, $pass)

# Устанавливаем пассивный режим
[System.Net.FtpWebRequest]::set_UsePassive($true)

# Загружаем все HTML файлы
Get-ChildItem -Filter "*.html" | ForEach-Object {
    $uri = New-Object System.Uri("$ftpUrl/public_html/$($_.Name)")
    Write-Host "Загружаем $($_.Name)..."
    $webclient.UploadFile($uri, $_.FullName)
}

# Создаем и загружаем папки и их содержимое
$directories = @("assets", "scripts", "styles")
foreach ($dir in $directories) {
    Write-Host "Создаем директорию $dir..."
    try {
        $makeDir = [System.Net.WebRequest]::Create("$ftpUrl/public_html/$dir")
        $makeDir.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
        $makeDir.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
        $makeDir.GetResponse()
    } catch {}

    Get-ChildItem -Path $dir -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Replace($PSScriptRoot + "\", "").Replace("\", "/")
        $uri = New-Object System.Uri("$ftpUrl/public_html/$relativePath")
        Write-Host "Загружаем $relativePath..."
        $webclient.UploadFile($uri, $_.FullName)
    }
} 