param(
    [switch]$DryRun
)

# Read credentials from environment variables to avoid hardcoding secrets
$ftpUrl = $env:FTP_URL
$user = $env:FTP_USER
$pass = $env:FTP_PASS
$remotePath = $env:FTP_REMOTE_PATH

if (-not $ftpUrl -or -not $user -or -not $pass) {
    Write-Error "FTP credentials are not set. Please set FTP_URL, FTP_USER, FTP_PASS environment variables."
    Write-Error 'Example: setx FTP_URL "ftp://host:21"; setx FTP_USER "username"; setx FTP_PASS "password"'
    exit 1
}

$buildRoot = Join-Path $PSScriptRoot "dist"
if (-not (Test-Path -LiteralPath $buildRoot)) {
    Write-Error "Папка dist не найдена. Сначала выполните npm run build."
    exit 1
}

if ($ftpUrl -notmatch '^ftp://[^\[\]\(\)]+(?::\d+)?/?$') {
    Write-Error "FTP_URL must be a plain FTP address, for example: ftp://server48.hosting.reg.ru"
    exit 1
}

if (-not $remotePath) {
    $remotePath = "www/inmise.ru"
}

if ($remotePath -match '^/' -or $remotePath -match '\.\.') {
    Write-Error "FTP_REMOTE_PATH must be relative to the FTP account root, for example: www/inmise.ru"
    exit 1
}

$webclient = New-Object System.Net.WebClient
$webclient.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
$remoteRoot = "$($ftpUrl.TrimEnd('/'))/$($remotePath.Trim('/'))"

function Get-RelativeUploadPath([string]$rootPath, [string]$fullPath) {
    $root = [System.IO.Path]::GetFullPath($rootPath).TrimEnd('\', '/')
    $target = [System.IO.Path]::GetFullPath($fullPath)
    $prefix = "$root\"

    if (-not $target.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Upload path is outside the build directory: $target"
    }

    return $target.Substring($prefix.Length)
}

function New-RemoteDirectory([string]$relativePath) {
    if (-not $relativePath) { return }
    if ($DryRun) { return }
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
            # REG.RU returns an error when the directory already exists.
        }
    }
}

# Upload only the verified production build, including route directories
# and the .htaccess redirects from legacy URLs.
Get-ChildItem -LiteralPath $buildRoot -Recurse -Directory |
    Sort-Object { $_.FullName.Length } |
    ForEach-Object {
        $relativeDirectory = Get-RelativeUploadPath $buildRoot $_.FullName
        New-RemoteDirectory $relativeDirectory
    }

Get-ChildItem -LiteralPath $buildRoot -Recurse -File -Force | ForEach-Object {
    $relativePath = (Get-RelativeUploadPath $buildRoot $_.FullName).Replace("\", "/")
    $uri = New-Object System.Uri("$remoteRoot/$relativePath")
    Write-Host "Uploading $relativePath..."
    if (-not $DryRun) {
        $webclient.UploadFile($uri, $_.FullName)
    }
}

$webclient.Dispose()
