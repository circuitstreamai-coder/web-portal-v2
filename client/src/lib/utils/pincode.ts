export interface PincodeResult {
  state: string;
  city: string;
}

export async function lookupPincode(pincode: string): Promise<PincodeResult | null> {
  if (!/^\d{6}$/.test(pincode)) return null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const json = await res.json();
    const postOffice = json?.[0]?.PostOffice?.[0];
    if (!postOffice) return null;
    return {
      state: postOffice.State ?? '',
      city: postOffice.District ?? '',
    };
  } catch {
    return null;
  }
}
