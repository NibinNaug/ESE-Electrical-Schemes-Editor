# ESE OCR evaluation corpus

This corpus evaluates two separate stages:

1. text recognition by the local Tesseract engine;
2. conversion of recognised lines into useful ESE reference proposals.

Run it explicitly with:

```powershell
npm run benchmark:ocr
```

One or more cases can be targeted while tuning the recogniser:

```powershell
npm run benchmark:ocr -- loc-automotive-blueprint-0500 openclipart-utp-colours
```

The benchmark is intentionally separate from `npm test`: real OCR is slower and
machine-dependent. Detailed output is written to `tmp/ocr-benchmark/results.json`.

## Publicly reusable fixtures

The six `loc-automotive-*.jpg` files are 50% IIIF renditions of pages 9, 40,
75, 150, 500 and 650 from *Automotive Wiring Manual* by Harry Lorin Wells et
al., published in 1918. The Library of Congress states that the book is in the
public domain and free to use and reuse. Credit: Library of Congress, General
Collections.

Source record:
https://www.loc.gov/item/19003762/

Page service pattern:
https://www.loc.gov/resource/gdcmassbookdig.automotivewiring00well/

`openclipart-utp-cat5e-wiring.png` is a 2000-pixel PNG rendition of *UTP Cat5E
wiring* by jobefox. It is released under CC0 1.0 by Openclipart.

Source:
https://openclipart.org/detail/299741/utp-cat5e-wiring

These images deliberately include difficult negatives: dense indexes, component
numbers, voltage values, wire gauges, rotated labels and coloured wires without a
usable reference legend. Reading text from them is not sufficient reason to add a
circuit reference.

## Local private fixtures

`local-private/` is ignored by version control and can contain additional local
fixtures that must never be redistributed with ESE. Optional cases are declared
in `local-private/cases.json`; the benchmark loads them when present and skips
them cleanly elsewhere.

This keeps real-world test material useful on a developer machine without ever
placing it in the public source tree, application bundles or release archives.
