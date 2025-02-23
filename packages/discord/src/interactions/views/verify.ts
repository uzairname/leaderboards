function hex2bin(hex: string) {
  const buf = new Uint8Array(Math.ceil(hex.length / 2))
  for (var i = 0; i < buf.length; i++) {
    buf[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return buf
}

export async function verify(request: Request, public_key: string) {
  const PUBLIC_KEY = crypto.subtle.importKey(
    'raw',
    hex2bin(public_key),
    { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' },
    true,
    ['verify'],
  )

  const encoder = new TextEncoder()

  const signature = hex2bin(request.headers.get('X-Signature-Ed25519')!)
  const timestamp = request.headers.get('X-Signature-Timestamp')
  const unknown = await request.clone().text()

  return crypto.subtle.verify('NODE-ED25519', await PUBLIC_KEY, signature, encoder.encode(timestamp + unknown))
}
