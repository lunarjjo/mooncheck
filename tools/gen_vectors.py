#!/usr/bin/env python3
"""Generator vektor uji mooncheck — menghasilkan vektor NIST/RFC yang otoritatatif
memakai hashlib/hmac Python, lalu ditulis sebagai modul JS untuk test suite Node."""
import hashlib, hmac, json

def sha256_hex(msg: bytes) -> str:
    return hashlib.sha256(msg).hexdigest()

def hmac_hex(key: bytes, msg: bytes) -> str:
    return hmac.new(key, msg, hashlib.sha256).hexdigest()

def pbkdf2_hex(pw: bytes, salt: bytes, iters: int, dklen: int) -> str:
    return hashlib.pbkdf2_hmac('sha256', pw, salt, iters, dklen).hex()

vectors = {
    "sha256": [
        {"in": "", "out": sha256_hex(b"")},
        {"in": "abc", "out": sha256_hex(b"abc")},
        {"in": "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
         "out": sha256_hex(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")},
        {"in": "satu dua tiga — uji UTF-8",
         "out": sha256_hex("satu dua tiga — uji UTF-8".encode('utf-8'))},
    ],
    "hmac": [
        {"key_hex": "0b"*20, "msg": "Hi There", "out": hmac_hex(bytes([0x0b]*20), b"Hi There")},
        {"key": "Jefe", "msg": "what do ya want for nothing?",
         "out": hmac_hex(b"Jefe", b"what do ya want for nothing?")},
        {"key_hex": "aa"*131, "msg": "Test Using Larger Than Block-Size Key - Hash Key First",
         "out": hmac_hex(bytes([0xaa]*131), b"Test Using Larger Than Block-Size Key - Hash Key First")},
    ],
    "pbkdf2": [
        {"pw": "password", "salt": "salt", "c": 1, "dk": 32,
         "out": pbkdf2_hex(b"password", b"salt", 1, 32)},
        {"pw": "password", "salt": "salt", "c": 2, "dk": 32,
         "out": pbkdf2_hex(b"password", b"salt", 2, 32)},
        {"pw": "password", "salt": "salt", "c": 4096, "dk": 32,
         "out": pbkdf2_hex(b"password", b"salt", 4096, 32)},
        {"pw": "passwd", "salt": "salt", "c": 1, "dk": 64,
         "out": pbkdf2_hex(b"passwd", b"salt", 1, 64)},
        {"pw": "Password", "salt_hex": "73616c74", "c": 4096, "dk": 20,
         "out": pbkdf2_hex(b"Password", bytes.fromhex("73616c74"), 4096, 20)},
    ],
}

utf8_cases = [
    {"s": "Halo, dunia!", "hex": "Halo, dunia!".encode('utf-8').hex()},
    {"s": "absen-—-tepat", "hex": "absen-—-tepat".encode('utf-8').hex()},
    {"s": "日本語テスト", "hex": "日本語テスト".encode('utf-8').hex()},
]

out = "/* DIBUAT OLEH tools/gen_vectors.py — jangan edit manual.\n"
out += "   Vektor dihitung dengan hashlib/hmac Python (otoritatatif). */\n"
out += "var MC_VECTORS = " + json.dumps({"crypto": vectors, "utf8": utf8_cases}, indent=2, ensure_ascii=False) + ";\n"
out += "if (typeof module !== 'undefined') module.exports = MC_VECTORS;\n"

with open('/home/z/my-project/scripts/mooncheck_dev/tests/vectors.js', 'w') as f:
    f.write(out)
print("vektor ditulis:", len(vectors['sha256']), "sha256,", len(vectors['hmac']), "hmac,", len(vectors['pbkdf2']), "pbkdf2")
