@php
    $age = $patient->ageYears();
    $g = ['male' => 'Male', 'female' => 'Female', 'other' => 'Other'][$patient->gender];
    $mobile = '+91 '.substr($patient->mobile, 0, 5).' '.substr($patient->mobile, 5);
@endphp
<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page { margin: 18mm 14mm; }
  body { font-family: DejaVu Sans, sans-serif; color: #0F2230; font-size: 10pt; }
  .mut { color: #4F6070; }
  .mono { font-family: DejaVu Sans Mono, monospace; }
  .card { width: 85.6mm; height: 54mm; border: 0.3mm solid #DDE4EA; border-radius: 3mm; overflow: hidden; display: inline-block; vertical-align: top; margin: 0 6mm 6mm 0; position: relative; }
  .head { background: #0C2233; color: #fff; padding: 2.6mm 3.6mm; }
  .head b { font-size: 10.5pt; }
  .head small { display: block; color: #9FB6C8; font-size: 6.5pt; letter-spacing: .5pt; }
  .body { padding: 2.6mm 3.6mm; }
  .name { font-size: 12.5pt; font-weight: bold; }
  .uhid { font-size: 11pt; font-weight: bold; }
  .back { padding: 3.6mm 4mm; font-size: 7.8pt; }
  .sticker { width: 62mm; height: 29mm; border: 0.3mm dashed #9FB0BE; padding: 1.6mm 2.4mm; display: inline-block; vertical-align: top; margin: 0 4mm 4mm 0; }
  h2 { font-size: 9pt; color: #4F6070; margin: 0 0 3mm; font-weight: normal; }
</style></head>
<body>
@if ($layout !== 'sticker')
  <h2>Registration card · cut along the border</h2>
  <div class="card">
    <div class="head"><b>{{ $hospital['name'] }}</b><small>OUTPATIENT REGISTRATION CARD</small></div>
    <div class="body">
      <div class="name">{{ $patient->full_name }}</div>
      <div class="mut" style="font-size:7.8pt">{{ $g }} · {{ $age }} yrs · DOB {{ $patient->dob_is_estimated ? 'approx. '.$patient->dob->format('Y') : $patient->dob->format('d M Y') }} · {{ $mobile }}</div>
      <table style="width:100%;margin-top:3mm;border-collapse:collapse"><tr>
        <td style="vertical-align:bottom"><div class="mut" style="font-size:6.5pt">UHID</div><div class="uhid mono">{{ $patient->uhid }}</div></td>
        <td style="width:36mm;text-align:center;vertical-align:bottom"><img src="data:image/png;base64,{{ $barcode }}" style="width:36mm;height:10mm"><div class="mono mut" style="font-size:6pt">{{ $patient->uhid }}</div></td>
      </tr></table>
    </div>
  </div>
  <div class="card">
    <div class="back">
      <div style="font-weight:bold;font-size:9pt">Please carry this card on every visit</div>
      <div class="mut" style="margin-top:1.5mm">Quote your UHID at the front desk, appointment calls and billing. Your UHID stays the same for life.</div>
      <div style="border-top:0.3mm solid #DDE4EA;margin:2.5mm 0"></div>
      <div><span class="mut">Address</span> &nbsp; {{ $hospital['address'] }}</div>
      <div><span class="mut">Phone</span> &nbsp; {{ $hospital['phone'] }}</div>
      <div><span class="mut">OPD hours</span> &nbsp; {{ $hospital['opd_hours'] }}</div>
      <div class="mut" style="font-size:6.5pt;margin-top:3mm">Your data is used only for your care and billing. Ask the front desk for a copy or correction.</div>
    </div>
  </div>
@endif
@if ($layout !== 'card')
  <h2>File sticker · 62 × 29 mm</h2>
  <div class="sticker">
    <table style="width:100%;border-collapse:collapse"><tr><td style="font-weight:bold;font-size:10pt">{{ $patient->full_name }}</td><td style="text-align:right" class="mut">{{ strtoupper(substr($g, 0, 1)) }} · {{ $age }} Y</td></tr></table>
    <div class="mono" style="font-weight:bold;font-size:9pt">{{ $patient->uhid }}</div>
    <img src="data:image/png;base64,{{ $barcode }}" style="width:57mm;height:9mm;margin-top:1mm">
    <div class="mut" style="font-size:6pt">Registered {{ $patient->registered_at->format('d M Y') }} · {{ $mobile }}</div>
  </div>
@endif
</body></html>
