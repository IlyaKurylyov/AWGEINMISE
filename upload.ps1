# Read credentials from environment variables to avoid hardcoding secrets
$ftpUrl = $env:FTP_URL
$user = $env:FTP_USER
$pass = $env:FTP_PASS

if (-not $ftpUrl -or -not $user -or -not $pass) {
    Write-Error "FTP credentials are not set. Please set FTP_URL, FTP_USER, FTP_PASS environment variables."
    Write-Error "Example: setx FTP_URL \"ftp://host:21\"; setx FTP_USER \"username\"; setx FTP_PASS \"password\""
    exit 1
}

$buildRoot = Join-Path $PSScriptRoot "dist"
if (-not (Test-Path -LiteralPath $buildRoot)) {
    Write-Error "Папка dist не найдена. Сначала выполните npm run build."
    exit 1
}

$webclient = New-Object System.Net.WebClient
$webclient.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
$remoteRoot = "$($ftpUrl.TrimEnd('/'))/public_html"

function New-RemoteDirectory([string]$relativePath) {
    if (-not $relativePath) { return }
    $segments = $relativePath.Replace("\", "/").Split('/', [System.StringSplitOptions]::RemoveEmptyEntries)
    $current = ""
    foreach ($segment in $segments) {
        $current = if ($current) { "$current/$segment" } else { $segment }
        try {
            $request = [System.Net.WebRequest]::Create("$remoteRoot/$current")
            $request.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
            $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
            $response = $request.GetResponse()
            $response.Close()
        } catch {
            # REG.RU возвращает ошибку, если каталог уже существует.
        }
    }
}

# Загружается только проверенная production-сборка, включая route-каталоги
# и .htaccess с перенаправлениями со старых адресов.
Get-ChildItem -LiteralPath $buildRoot -Recurse -Directory |
    Sort-Object { $_.FullName.Length } |
    ForEach-Object {
        $relativeDirectory = [System.IO.Path]::GetRelativePath($buildRoot, $_.FullName)
        New-RemoteDirectory $relativeDirectory
    }

Get-ChildItem -LiteralPath $buildRoot -Recurse -File -Force | ForEach-Object {
    $relativePath = [System.IO.Path]::GetRelativePath($buildRoot, $_.FullName).Replace("\", "/")
    $uri = New-Object System.Uri("$remoteRoot/$relativePath")
    Write-Host "Загружаем $relativePath..."
    $webclient.UploadFile($uri, $_.FullName)
}

$webclient.Dispose()
