# Descarga las fotos de los productos del Google Site de Aukan3D a fotos-sitio\
# Lee cada página en el momento, porque los enlaces de las fotos vencen en pocos minutos.
$ErrorActionPreference = 'Continue'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
$dest = Join-Path $PSScriptRoot 'fotos-sitio'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$paginas = 'figuras','soportes-y-exhibidores','cuadros-3d','llaveros','crochet-super-mario','crochet-demon-slayer','crochet-one-piece','crochet-naruto','crochet-pokemon','crochet-dragon-ball','figuras-de-peliculas-en-crochet','crochet-stitch','crochet-de-videojuegos-variados','crochet-hello-kitty','crochet-de-anime','crochet-marvel-y-dc','harry-potter'
$ok = 0; $total = 0
foreach ($p in $paginas) {
  $html = (Invoke-WebRequest -Uri "https://sites.google.com/view/aukan3d-uy/tienda-online/$p" -UserAgent $ua -UseBasicParsing).Content
  $urls = [regex]::Matches($html, 'src="(https://sites\.google\.com/sitesv-images-rt/[^"]+)"') | ForEach-Object { $_.Groups[1].Value.Replace('&amp;','&') } | Select-Object -Unique
  $i = 0
  foreach ($u in $urls) {
    $total++
    $u2 = ($u -replace '=w\d+$','') + '=w600'
    try { Invoke-WebRequest -Uri $u2 -UserAgent $ua -Headers @{ Referer = 'https://sites.google.com/' } -OutFile (Join-Path $dest "$p-$i.jpg") -UseBasicParsing; $ok++ }
    catch { Write-Output "FALLO $p-$i : $($_.Exception.Message)" }
    $i++
  }
}
Write-Output "Descargadas $ok de $total"
