Add-Type -AssemblyName System.Drawing

$srcPath = $args[0]
$outDir  = $args[1]

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$src = [System.Drawing.Image]::FromFile($srcPath)

function Save-Size([int]$w, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap($w, $w)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $w, $w)
  $bmp.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

# Masquable : fond plein (couleur du bord) + icone a 82% centree (zone sure 80%)
$mask = New-Object System.Drawing.Bitmap(512, 512)
$mg = [System.Drawing.Graphics]::FromImage($mask)
$corner = $src.GetPixel(10, 512)
$mg.Clear($corner)
$pad = 46
$mg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$mg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$mg.DrawImage($src, $pad, $pad, 420, 420)
$mask.Save((Join-Path $outDir 'icon-512-maskable.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$mg.Dispose(); $mask.Dispose()

Save-Size 512 'icon-512.png'
Save-Size 192 'icon-192.png'
Save-Size 180 'icon-180.png'
Save-Size 32  'icon-32.png'

$src.Dispose()
Write-Output "ICONES_OK"
