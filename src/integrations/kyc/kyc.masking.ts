export function maskAadhaar(aadhaarNumber: string): string {
  return `XXXXXXXX${aadhaarNumber.slice(-4)}`;
}

export function maskPan(pan: string): string {
  return `${pan.slice(0, 5)}***${pan.slice(-2)}`;
}
