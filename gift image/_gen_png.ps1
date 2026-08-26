$ErrorActionPreference = 'Stop'
$d = 'c:\Users\Inspiron\Desktop\silasroam\Casino-criptoporno\gift image'

# prefix -> Collection (name, price TON)
$prefixMap = [ordered]@{
    'art' = @('Artisan Bricks','61.9')
    'ast' = @('Astral Shards','130')
    'bda' = @('B-Day Candles','4.17')
    'ber' = @('Berry Boxes','8.34')
    'big' = @('Big Years','3.41')
    'bon' = @('Bonded Rings','38')
    'can' = @('Candy Canes','3.97')
    'chi' = @('Chill Flames','3.21')
    'coo' = @('Cookie Hearts','4.58')
    'cry' = @('Crystal Balls','12')
    'cup' = @('Cupid Charms','21')
    'dia' = @('Diamond Rings','29.7')
    'dog' = @('Snoop Doggs','4.20')
    'dur' = @("Durov's Caps",'390')
    'eas' = @('Easter Eggs','3.67')
    'ele' = @('Electric Skulls','23')
    'ete' = @('Eternal Candles','5.7')
    'evi' = @('Evil Eyes','6.70')
    'fly' = @('Flying Brooms','11')
    'gem' = @('Gem Signets','62.79')
    'gen' = @('Genie Lamps','36.5')
    'han' = @('Hanging Stars','8.94')
    'hea' = @('Heart Lockets','1100')
    'her' = @('Heroic Helmets','174')
    'hex' = @('Hex Pots','4.16')
    'ice' = @('Ice Creams','2.84')
    'ion' = @('Ion Gems','57.98')
    'jel' = @('Jelly Bunnies','6.97')
    'jes' = @('Jester Hats','2.50')
    'jol' = @('Jolly Chimps','6.34')
    'kis' = @('Kissed Frogs','38')
    'lig' = @('Light Swords','5.82')
    'loo' = @('Loot Bags','112.77')
    'lov' = @('Love Candles','8.17')
    'low' = @('Low Riders','45.40')
    'mad' = @('Mad Pumpkins','9.20')
    'mag' = @('Magic Potions','54.96')
    'mig' = @('Mighty Arms','104.82')
    'min' = @('Mini Oscars','69.85')
    'nai' = @('Nail Bracelets','111.67')
    'nek' = @('Neko Helmets','35.25')
    'per' = @('Perfume Bottles','64.32')
    'plu' = @('Plush Pepes','5149')
    'pre' = @('Precious Peaches','240.20')
    'sca' = @('Scared Cats','154')
    'sha' = @('Sharp Tongues','38.89')
    'sku' = @('Skull Flowers','9.45')
    'sno' = @('Snoop Cigars','10.63')
    'swa' = @('Swag Bags','5.20')
    'swi' = @('Swiss Watches','45.93')
    'top' = @('Top Hats','10')
    'toy' = @('Toy Bears','33.97')
    'tra' = @('Trapped Hearts','14.89')
    'val' = @('Valentine Boxes','10.65')
    'vin' = @('Vintage Cigars','34')
    'voo' = @('Voodoo Dolls','32.04')
    'wes' = @('Westside Signs','94')
    'wit' = @('Witch Hats','4.14')
}

# Файлы: только PNG (без прозрачного фона - уже готовые). Имена с суффиксом -Photoroom.
$files = Get-ChildItem -LiteralPath $d -Filter '*.png' | Sort-Object Name

$out = [System.Collections.Generic.List[string]]::new()
$out.Add('// Auto-generated gifts config - one object per FILE (PNG, no background).')
$out.Add('// Each variant inherits the name/price of its collection by prefix.')
$out.Add('export const giftsData = [')
$idx = 0
foreach ($f in $files) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    # Убираем суффикс -Photoroom и хвостовые цифры -> префикс коллекции, напр. art-Photoroom -> art, art2-Photoroom -> art
    $stem = $base -replace '-Photoroom$', ''
    $prefix = [regex]::Replace($stem, '\d+$', '')
    if (-not $prefixMap.Contains($prefix)) { continue }   # пропускаем сирот без коллекции (напр. 'ber' с некорректной префиксом)
    $name = $prefixMap[$prefix][0]
    $price = $prefixMap[$prefix][1]
    $nameEsc = $name -replace "'", "\'"
    $slug = ($name -replace '[^a-zA-Z0-9]+','_').ToLower()
    $id = $slug + '__' + $base
    $img = 'gift image/' + $f.Name
    $line = "  { id: '$id', name: '$nameEsc', price: $price, currency: 'TON', image: '$img' },"
    $out.Add($line)
    $idx++
}
$out.Add('];')
$out.Add('')
$out.Add("export const giftsCount = $idx;")
$out.ToArray() | Set-Content -LiteralPath (Join-Path (Split-Path $d -Parent) 'giftsData.js') -Encoding UTF8
Write-Output ("WROTE giftsData.js with " + $idx + " individual entries from PNG files")
Write-Output "--- ORPHAN PNG files skipped (no matching collection) ---"
foreach ($f in $files) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    $stem = $base -replace '-Photoroom$', ''
    $prefix = [regex]::Replace($stem, '\d+$', '')
    if (-not $prefixMap.Contains($prefix)) { Write-Output ('  ' + $f.Name) }
}