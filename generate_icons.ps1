Add-Type -AssemblyName System.Drawing

function Create-Icon {
    param([int]$Size, [string]$Path)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'HighQuality'
    $g.InterpolationMode = 'HighQualityBicubic'

    $p1 = New-Object System.Drawing.Point(0, 0)
    $p2 = New-Object System.Drawing.Point($Size, $Size)
    $c1 = [System.Drawing.Color]::FromArgb(67, 56, 202)
    $c2 = [System.Drawing.Color]::FromArgb(99, 102, 241)

    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($p1, $p2, $c1, $c2)
    $g.FillRectangle($brush, 0, 0, $Size, $Size)

    $fontSize = [int]($Size * 0.55)
    $font = New-Object System.Drawing.Font('Arial', $fontSize, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = 'Center'
    $sf.LineAlignment = 'Center'
    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $g.DrawString('Y', $font, $textBrush, $rect, $sf)

    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created $Path"
}

Create-Icon -Size 16 -Path 'C:\Local\test\Badminton-YoYaku\icons\icon16.png'
Create-Icon -Size 48 -Path 'C:\Local\test\Badminton-YoYaku\icons\icon48.png'
Create-Icon -Size 128 -Path 'C:\Local\test\Badminton-YoYaku\icons\icon128.png'
