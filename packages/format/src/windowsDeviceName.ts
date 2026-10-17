// Windows opens these as devices in any folder and with any extension ("CON.png", "com1.txt"); a checkout of such a
// file breaks. Superscript digits count too: Windows maps them to 1-3 for COM and LPT.
const devices = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "CONIN$",
  "CONOUT$",
  ...["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "¹", "²", "³"].flatMap((digit) => [
    `COM${digit}`,
    `LPT${digit}`,
  ]),
]);

/** The Windows device a file name opens (extension, trailing spaces and letter case ignored), upper case; else `undefined`. */
export function windowsDeviceName(name: string): string | undefined {
  const dot = name.indexOf(".");
  const stem = (dot === -1 ? name : name.slice(0, dot)).replace(/ +$/, "").toUpperCase();
  return devices.has(stem) ? stem : undefined;
}
