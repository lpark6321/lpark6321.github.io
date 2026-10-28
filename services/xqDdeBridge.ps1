param(
  [int]$Port = 8788,
  [string]$Service = "XQKGIAP",
  [string]$Topic = "Quote",
  [string]$DayFuturesRoot = "FITX*1.TF",
  [string]$AfterHoursFuturesRoot = "FITXN*1.TF",
  [string]$SpotRoot = "TSE.TW",
  [string]$SpotTopic = "",
  [string]$Provider = "KGI"
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public sealed class DdeClient : IDisposable
{
    private const int APPCMD_CLIENTONLY = 0x00000010;
    private const int CP_WINANSI = 1004;
    private const int CF_TEXT = 1;
    private const int XTYP_REQUEST = 0x20B0;
    private const int TIMEOUT_MS = 3000;

    private delegate IntPtr DdeCallback(
        int uType, int uFmt, IntPtr hconv, IntPtr hsz1, IntPtr hsz2,
        IntPtr hdata, IntPtr dwData1, IntPtr dwData2);

    private readonly DdeCallback callback;
    private int instanceId;
    private IntPtr serviceHandle;
    private IntPtr topicHandle;
    private IntPtr conversation;

    [DllImport("user32.dll", EntryPoint = "DdeInitializeA", CharSet = CharSet.Ansi)]
    private static extern int DdeInitialize(ref int pidInst, DdeCallback pfnCallback, int afCmd, int ulRes);

    [DllImport("user32.dll", EntryPoint = "DdeCreateStringHandleA", CharSet = CharSet.Ansi)]
    private static extern IntPtr DdeCreateStringHandle(int idInst, string psz, int iCodePage);

    [DllImport("user32.dll")]
    private static extern bool DdeFreeStringHandle(int idInst, IntPtr hsz);

    [DllImport("user32.dll")]
    private static extern IntPtr DdeConnect(int idInst, IntPtr hszService, IntPtr hszTopic, IntPtr pCC);

    [DllImport("user32.dll")]
    private static extern bool DdeDisconnect(IntPtr hConv);

    [DllImport("user32.dll")]
    private static extern IntPtr DdeClientTransaction(
        IntPtr pData, int cbData, IntPtr hConv, IntPtr hszItem, int wFmt,
        int wType, int dwTimeout, ref IntPtr pdwResult);

    [DllImport("user32.dll")]
    private static extern IntPtr DdeAccessData(IntPtr hData, ref int pcbDataSize);

    [DllImport("user32.dll")]
    private static extern bool DdeUnaccessData(IntPtr hData);

    [DllImport("user32.dll")]
    private static extern bool DdeFreeDataHandle(IntPtr hData);

    [DllImport("user32.dll")]
    private static extern bool DdeUninitialize(int idInst);

    [DllImport("user32.dll")]
    private static extern int DdeGetLastError(int idInst);

    public DdeClient(string service, string topic)
    {
        callback = new DdeCallback(OnDdeCallback);
        int result = DdeInitialize(ref instanceId, callback, APPCMD_CLIENTONLY, 0);
        if (result != 0) throw new InvalidOperationException("DdeInitialize failed: " + result);

        try
        {
            serviceHandle = DdeCreateStringHandle(instanceId, service, CP_WINANSI);
            topicHandle = DdeCreateStringHandle(instanceId, topic, CP_WINANSI);
            conversation = DdeConnect(instanceId, serviceHandle, topicHandle, IntPtr.Zero);
            if (conversation == IntPtr.Zero)
            {
                int ddeError = DdeGetLastError(instanceId);
                throw new InvalidOperationException("DdeConnect failed. Service=" + service + ", Topic=" + topic + ", DDE last error=" + ddeError + ". Check quote software is running, DDE is enabled, and this bridge uses the same permission level/admin mode as the quote software.");
            }
        }
        catch
        {
            Dispose();
            throw;
        }
    }

    public string Request(string item)
    {
        IntPtr itemHandle = DdeCreateStringHandle(instanceId, item, CP_WINANSI);
        IntPtr result = IntPtr.Zero;
        IntPtr dataHandle = IntPtr.Zero;
        try
        {
            dataHandle = DdeClientTransaction(
                IntPtr.Zero, 0, conversation, itemHandle, CF_TEXT,
                XTYP_REQUEST, TIMEOUT_MS, ref result);
            if (dataHandle == IntPtr.Zero)
            {
                int ddeError = DdeGetLastError(instanceId);
                throw new InvalidOperationException("DdeClientTransaction failed. Item=" + item + ", DDE last error=" + ddeError + ".");
            }

            int size = 0;
            IntPtr data = DdeAccessData(dataHandle, ref size);
            if (data == IntPtr.Zero || size <= 0) return "";

            byte[] bytes = new byte[size];
            Marshal.Copy(data, bytes, 0, size);
            DdeUnaccessData(dataHandle);

            int length = Array.IndexOf(bytes, (byte)0);
            if (length < 0) length = bytes.Length;
            return Encoding.Default.GetString(bytes, 0, length).Trim();
        }
        finally
        {
            if (dataHandle != IntPtr.Zero) DdeFreeDataHandle(dataHandle);
            if (itemHandle != IntPtr.Zero) DdeFreeStringHandle(instanceId, itemHandle);
        }
    }

    private static IntPtr OnDdeCallback(
        int uType, int uFmt, IntPtr hconv, IntPtr hsz1, IntPtr hsz2,
        IntPtr hdata, IntPtr dwData1, IntPtr dwData2)
    {
        return IntPtr.Zero;
    }

    public void Dispose()
    {
        if (conversation != IntPtr.Zero) DdeDisconnect(conversation);
        if (serviceHandle != IntPtr.Zero) DdeFreeStringHandle(instanceId, serviceHandle);
        if (topicHandle != IntPtr.Zero) DdeFreeStringHandle(instanceId, topicHandle);
        if (instanceId != 0) DdeUninitialize(instanceId);
        conversation = IntPtr.Zero;
        serviceHandle = IntPtr.Zero;
        topicHandle = IntPtr.Zero;
        instanceId = 0;
    }
}
"@

$script:clients = @{}
$script:candles = @{}
$script:lastVolumeBySymbol = @{}
$script:taishinFieldCodes = @{
  ID = "2020"
  Name = "2020"
  Bid = "101"
  Ask = "102"
  Price = "125"
  PriceChange = "184"
  PriceChangeRatio = "185"
  PreClose = "129"
  High = "130"
  Low = "131"
  Volume = "404"
}
$script:taishinSpotFieldCodes = @{
  ID = "2020"
  Name = "2020"
  AmountYi = "424"
}

function Get-DdeClient($topic = $Topic) {
  $key = "$Service|$topic"
  if (-not $script:clients.ContainsKey($key)) {
    $script:clients[$key] = [DdeClient]::new($Service, $topic)
  }
  return $script:clients[$key]
}

function Dispose-DdeClients {
  foreach ($client in $script:clients.Values) {
    if ($client -ne $null) { $client.Dispose() }
  }
  $script:clients.Clear()
}

function Convert-ToNumber($value) {
  $text = [string]$value
  $text = $text.Trim().Replace(",", "").Replace("%", "")
  if ($text -eq "" -or $text -eq "--" -or $text -eq "#N/A") { return $null }
  $number = 0.0
  if ([double]::TryParse($text, [ref]$number)) { return $number }
  return $null
}

function Get-QuoteTime($text) {
  $now = Get-Date
  $time = [string]$text
  $parsed = [datetime]::MinValue
  if ([datetime]::TryParse($time, [ref]$parsed)) {
    if ($parsed.Year -le 1900) {
      $candidate = Get-Date -Year $now.Year -Month $now.Month -Day $now.Day -Hour $parsed.Hour -Minute $parsed.Minute -Second $parsed.Second
      if ($candidate -gt $now.AddMinutes(5)) {
        return $candidate.AddDays(-1)
      }
      return $candidate
    }
    return $parsed
  }
  return $now
}

function Get-XqRoot($symbol) {
  $value = ([string]$symbol).Trim().ToUpperInvariant()
  if ($value -match "^(INDEX:TWII|TWSE:TAIEX|FITX00|TSE\.TW)") { return $SpotRoot }
  if ($value -match "^(FITX\*1|FITX1|TXDAY|TX_DAY)$") { return $DayFuturesRoot }
  if ($value -match "^(FITXN\*1|FITXN1|TXFULL|TX_FULL)$") { return $AfterHoursFuturesRoot }
  $now = Get-Date
  $minute = $now.Hour * 60 + $now.Minute
  $dayStart = 8 * 60 + 45
  $dayEnd = 13 * 60 + 45
  if ($minute -ge $dayStart -and $minute -le $dayEnd) { return $DayFuturesRoot }
  return $AfterHoursFuturesRoot
}

function Request-DdeField($root, $field, [bool]$required = $false) {
  $isTaishin = $Provider -eq "Taishin" -or $Service -eq "MMSDDE"
  $requestTopic = if ($root -eq $SpotRoot -and -not [string]::IsNullOrWhiteSpace($SpotTopic)) { $SpotTopic } else { $Topic }
  if ($isTaishin) {
    $fieldCodes = if ($root -eq $SpotRoot -and -not [string]::IsNullOrWhiteSpace($SpotTopic)) { $script:taishinSpotFieldCodes } else { $script:taishinFieldCodes }
    if (-not $fieldCodes.ContainsKey($field)) {
      if ($required) { throw "Taishin DDE field is not mapped: $field" }
      return $null
    }
    $item = "$root.$($fieldCodes[$field])"
  } else {
    $item = "$root-$field"
  }
  try {
    return (Get-DdeClient $requestTopic).Request($item)
  } catch {
    if ($required) { throw "DDE item failed: $item ($($_.Exception.Message))" }
    return $null
  }
}

function Read-DdeQuote($root) {
  return @{
    ID = Request-DdeField $root "ID"
    Name = Request-DdeField $root "Name"
    Time = Request-DdeField $root "Time"
    Bid = Request-DdeField $root "Bid"
    Ask = Request-DdeField $root "Ask"
    Price = Request-DdeField $root "Price" ($root -ne $SpotRoot)
    PriceChange = Request-DdeField $root "PriceChange"
    PriceChangeRatio = Request-DdeField $root "PriceChangeRatio"
    Amplitude = Request-DdeField $root "Amplitude"
    PreClose = Request-DdeField $root "PreClose"
    Open = Request-DdeField $root "Open"
    High = Request-DdeField $root "High"
    Low = Request-DdeField $root "Low"
    Volume = Request-DdeField $root "Volume"
    TotalVolume = Request-DdeField $root "TotalVolume"
    AvgPrice = Request-DdeField $root "AvgPrice"
    InOutRatioNumber = Request-DdeField $root "InOutRatioNumber"
      PreTotalVolume = Request-DdeField $root "PreTotalVolume"
      AmountYi = Request-DdeField $root "AmountYi"
    }
}

function Alternate-FuturesRoot($root) {
  if ($root -eq $AfterHoursFuturesRoot) { return $DayFuturesRoot }
  if ($root -eq $DayFuturesRoot) { return $AfterHoursFuturesRoot }
  return $null
}

function Get-XqQuote([string]$symbol = "TX") {
  $root = Get-XqRoot $symbol
  try {
    $quote = Read-DdeQuote $root
  } catch {
    $alternateRoot = Alternate-FuturesRoot $root
    if ($alternateRoot -eq $null) { throw }
    Write-Host "DDE primary root failed: $root. Trying alternate root: $alternateRoot. Error: $($_.Exception.Message)"
    $root = $alternateRoot
    $quote = Read-DdeQuote $root
  }

  $price = Convert-ToNumber $quote.Price
  $priceSource = "Price"
  if ($price -eq $null -and $root -ne $SpotRoot) {
    $askForPrice = Convert-ToNumber $quote.Ask
    $bidForPrice = Convert-ToNumber $quote.Bid
    if ($askForPrice -ne $null) {
      $price = $askForPrice
      $priceSource = "Ask"
    } elseif ($bidForPrice -ne $null) {
      $price = $bidForPrice
      $priceSource = "Bid"
    }
  }
  $open = Convert-ToNumber $quote.Open
  $high = Convert-ToNumber $quote.High
  $low = Convert-ToNumber $quote.Low
  $preClose = Convert-ToNumber $quote.PreClose
  if ($price -eq $null) {
    throw "DDE item has no price: $root-Price (raw Price='$($quote.Price)', Ask='$($quote.Ask)', Bid='$($quote.Bid)')"
  }
  if ($open -eq $null) { $open = if ($preClose -ne $null) { $preClose } else { $price } }
  if ($high -eq $null) { $high = $price }
  if ($low -eq $null) { $low = $price }

  $tickVolume = Convert-ToNumber $quote.Volume
  $totalVolume = Convert-ToNumber $quote.TotalVolume
  $amountYi = Convert-ToNumber $quote.AmountYi
  $quoteTime = Get-QuoteTime $quote.Time
  $sampleTime = Get-Date
  $normalizedSymbol = if ($root -eq $SpotRoot) { "INDEX:TWII" } elseif ($root -eq $DayFuturesRoot) { "FITX*1" } else { "FITXN*1" }
  $session = if ($root -eq $DayFuturesRoot) { "day" } elseif ($root -eq $AfterHoursFuturesRoot) { "after-hours" } else { "spot" }
  return [pscustomobject]@{
    symbol = $normalizedSymbol
    session = $session
    id = $quote.ID
    name = $quote.Name
    time = ([DateTimeOffset]$sampleTime).ToUnixTimeSeconds()
    tradeTime = ([DateTimeOffset]$quoteTime).ToUnixTimeSeconds()
    bid = Convert-ToNumber $quote.Bid
    ask = Convert-ToNumber $quote.Ask
    open = $open
    high = $high
    low = $low
    close = $price
    price = $price
    priceSource = $priceSource
    prevClose = $preClose
    change = Convert-ToNumber $quote.PriceChange
    changePct = Convert-ToNumber $quote.PriceChangeRatio
    amplitude = Convert-ToNumber $quote.Amplitude
    volume = if ($totalVolume -ne $null) { $totalVolume } else { $tickVolume }
    tickVolume = $tickVolume
    totalVolume = $totalVolume
    amountYi = $amountYi
    avgPrice = Convert-ToNumber $quote.AvgPrice
    inOutRatio = Convert-ToNumber $quote.InOutRatioNumber
    prevTotalVolume = Convert-ToNumber $quote.PreTotalVolume
    root = $root
    raw = $quote
  }
}

function Get-BucketKey($epoch, $timeframe) {
  if ($timeframe -eq "1s" -or $timeframe -eq "tick") { return [int64]$epoch }
  if ($timeframe -eq "1m") { return [int64]([Math]::Floor($epoch / 60) * 60) }
  if ($timeframe -eq "5m") { return [int64]([Math]::Floor($epoch / 300) * 300) }
  return (Get-Date "1970-01-01Z").AddSeconds($epoch).ToLocalTime().ToString("yyyy-MM-dd")
}

function Normalize-Timeframe($timeframe) {
  if ($timeframe -eq "tick") { return "1s" }
  return $timeframe
}

function Update-Candle($quote, $timeframe) {
  $timeframe = Normalize-Timeframe $timeframe
  $bucket = Get-BucketKey $quote.time $timeframe
  $key = "$($quote.symbol):$($timeframe):$bucket"
  $volumeKey = "$($quote.symbol):$timeframe"
  $tradePrice = [double]$quote.close
  $volumeDelta = 0
  if ($quote.volume -ne $null) {
    $currentVolume = [double]$quote.volume
    $previousVolume = if ($script:lastVolumeBySymbol.ContainsKey($volumeKey)) { [double]$script:lastVolumeBySymbol[$volumeKey] } else { $currentVolume }
    $volumeDelta = if ($currentVolume -ge $previousVolume) { $currentVolume - $previousVolume } else { $currentVolume }
    $script:lastVolumeBySymbol[$volumeKey] = $currentVolume
  }

  if (-not $script:candles.ContainsKey($key)) {
    $script:candles[$key] = [ordered]@{
      time = $bucket
      open = $tradePrice
      high = $tradePrice
      low = $tradePrice
      close = $tradePrice
      volume = 0
      prevClose = $quote.prevClose
    }
  }

  $candle = $script:candles[$key]
  $candle.high = [Math]::Max([double]$candle.high, $tradePrice)
  $candle.low = [Math]::Min([double]$candle.low, $tradePrice)
  $candle.close = $tradePrice
  if ($quote.volume -ne $null) { $candle.volume = [double]$candle.volume + $volumeDelta }
  if ($quote.prevClose -ne $null) { $candle.prevClose = $quote.prevClose }
}

function Update-AllCandles($quote) {
  @("1s", "1m", "5m", "D") | ForEach-Object {
    Update-Candle $quote $_
  }
}

function Send-Json($response, $status, $payload) {
  try {
    $json = if ($status -eq 204) { "" } else { $payload | ConvertTo-Json -Depth 8 -Compress }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.StatusCode = $status
    $response.ContentType = "application/json; charset=utf-8"
    $response.Headers["Access-Control-Allow-Origin"] = "*"
    $response.Headers["Access-Control-Allow-Methods"] = "GET,OPTIONS"
    $response.Headers["Access-Control-Allow-Headers"] = "Content-Type,Accept"
    if ($bytes.Length -gt 0) {
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch [System.Net.HttpListenerException] {
    Write-Host "HTTP client disconnected before response completed: $($_.Exception.Message)"
  } catch {
    Write-Host "HTTP response failed: $($_.Exception.Message)"
  } finally {
    try {
      $response.OutputStream.Close()
    } catch {
      Write-Host "HTTP response close skipped: $($_.Exception.Message)"
    }
  }
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "XQ DDE bridge v2 listening on http://127.0.0.1:$Port"
Write-Host "PowerShell process bitness: $(if ([Environment]::Is64BitProcess) { '64-bit' } else { '32-bit' })"
Write-Host "DDE day futures root:         $Service | $Topic ! $DayFuturesRoot-*"
Write-Host "DDE after-hours futures root: $Service | $Topic ! $AfterHoursFuturesRoot-*"
Write-Host "DDE spot root:    $Service | $(if ([string]::IsNullOrWhiteSpace($SpotTopic)) { $Topic } else { $SpotTopic }) ! $SpotRoot-*"
Write-Host "DDE provider:     $Provider"

try {
  while ($listener.IsListening) {
    try {
      $context = $listener.GetContext()
    } catch [System.Net.HttpListenerException] {
      if ($listener.IsListening) {
        Write-Host "HTTP listener error: $($_.Exception.Message)"
      }
      continue
    }

    $request = $context.Request
    $response = $context.Response

    if ($request.HttpMethod -eq "OPTIONS") {
      Send-Json $response 204 @{}
      continue
    }

    try {
      $path = $request.Url.AbsolutePath
      $symbol = [string]$request.QueryString["symbol"]
      $timeframe = $request.QueryString["timeframe"]
      if ([string]::IsNullOrWhiteSpace($timeframe)) { $timeframe = "1m" }

      if ($path -eq "/api/xq-quote") {
        $quote = Get-XqQuote $symbol
        Send-Json $response 200 $quote
        continue
      }

      if ($path -eq "/api/broker-candles") {
        $quote = Get-XqQuote $symbol
        $timeframe = Normalize-Timeframe $timeframe
        Update-AllCandles $quote
        $rows = @($script:candles.GetEnumerator() |
          Where-Object { $_.Key -like "$($quote.symbol):$($timeframe):*" } |
          ForEach-Object { $_.Value } |
          Sort-Object time)
        Send-Json $response 200 @{ data = $rows; quote = $quote }
        continue
      }

      Send-Json $response 404 @{ error = "Not found"; endpoints = @("/api/xq-quote?symbol=TX", "/api/broker-candles?symbol=TX&timeframe=1s", "/api/broker-candles?symbol=TX&timeframe=1m") }
    } catch {
      Send-Json $response 502 @{ error = $_.Exception.Message }
    }
  }
} finally {
  Dispose-DdeClients
  $listener.Stop()
}
