<?php
// Minimaalinen PDF-kirjoittaja (ei riippuvuuksia): A4, Helvetica / Helvetica-Bold, teksti ja viivat. UTF-8 -> Windows-1252 (ä, ö, å, €).
class BsPdf {
    private array $pages = []; private string $cur = '';
    public function __construct() { $this->addPage(); }
    public function addPage(): void { if ($this->cur !== '') $this->pages[] = $this->cur; $this->cur = ''; }
    private static function enc(string $s): string {
        $s = str_replace(["\u{2013}", "\u{2014}", "\u{2192}", "\u{21C4}", "\u{2022}"], ['-', '-', '->', '<->', '*'], $s);
        $c = @iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $s); if ($c === false) $c = preg_replace('/[^\x20-\x7E]/', '?', $s);
        return str_replace(['\\', '(', ')', "\r", "\n"], ['\\\\', '\\(', '\\)', ' ', ' '], $c);
    }
    // Teksti kohtaan (x, y) pisteinä, y alhaalta ylös. $align: 'l' | 'r' (oikea reuna x:ssä)
    public function text(float $x, float $y, string $s, float $size = 10, bool $bold = false, string $align = 'l', array $rgb = [0, 0, 0]): void {
        if ($align === 'r') $x -= self::width($s, $size, $bold);
        $this->cur .= sprintf("BT /%s %.1F Tf %.3F %.3F %.3F rg %.2F %.2F Td (%s) Tj ET\n", $bold ? 'F2' : 'F1', $size, $rgb[0], $rgb[1], $rgb[2], $x, $y, self::enc($s));
    }
    public function line(float $x1, float $y1, float $x2, float $y2, float $w = 0.6, array $rgb = [0.7, 0.7, 0.7]): void {
        $this->cur .= sprintf("%.2F w %.3F %.3F %.3F RG %.2F %.2F m %.2F %.2F l S\n", $w, $rgb[0], $rgb[1], $rgb[2], $x1, $y1, $x2, $y2);
    }
    public function rect(float $x, float $y, float $w, float $h, array $rgb): void { $this->cur .= sprintf("%.3F %.3F %.3F rg %.2F %.2F %.2F %.2F re f\n", $rgb[0], $rgb[1], $rgb[2], $x, $y, $w, $h); }
    // Likimääräinen leveys (Helvetica ~0.5 em, lihavoitu hieman leveämpi) oikealle tasaukseen
    public static function width(string $s, float $size, bool $bold = false): float { return mb_strlen($s) * $size * ($bold ? 0.56 : 0.52); }
    public function output(string $title = ''): string {
        $this->addPage(); $objs = []; $n = count($this->pages);
        $objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
        $kids = []; for ($i = 0; $i < $n; $i++) $kids[] = (5 + $i * 2) . ' 0 R';
        $objs[2] = "<< /Type /Pages /Kids [" . implode(' ', $kids) . "] /Count $n >>";
        $objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
        $objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
        foreach ($this->pages as $i => $content) {
            $po = 5 + $i * 2; $co = $po + 1;
            $objs[$po] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents $co 0 R >>";
            $objs[$co] = "<< /Length " . strlen($content) . " >>\nstream\n" . $content . "endstream";
        }
        $info = count($objs) + 1; $objs[$info] = "<< /Title (" . self::enc($title) . ") /Producer (BarShift) >>";
        $out = "%PDF-1.4\n"; $off = [];
        for ($i = 1; $i <= count($objs); $i++) { $off[$i] = strlen($out); $out .= "$i 0 obj\n" . $objs[$i] . "\nendobj\n"; }
        $x = strlen($out); $out .= "xref\n0 " . (count($objs) + 1) . "\n0000000000 65535 f \n";
        for ($i = 1; $i <= count($objs); $i++) $out .= sprintf("%010d 00000 n \n", $off[$i]);
        return $out . "trailer\n<< /Size " . (count($objs) + 1) . " /Root 1 0 R /Info $info 0 R >>\nstartxref\n$x\n%%EOF\n";
    }
}
