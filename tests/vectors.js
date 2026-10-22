/* DIBUAT OLEH tools/gen_vectors.py — jangan edit manual.
   Vektor dihitung dengan hashlib/hmac Python (otoritatatif). */
var MC_VECTORS = {
  "crypto": {
    "sha256": [
      {
        "in": "",
        "out": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      },
      {
        "in": "abc",
        "out": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      },
      {
        "in": "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
        "out": "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
      },
      {
        "in": "satu dua tiga — uji UTF-8",
        "out": "efaa606f021d61083b13d1fa08ece9a8c59ff7062c9757b1832706158d97b57c"
      }
    ],
    "hmac": [
      {
        "key_hex": "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b",
        "msg": "Hi There",
        "out": "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
      },
      {
        "key": "Jefe",
        "msg": "what do ya want for nothing?",
        "out": "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
      },
      {
        "key_hex": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "msg": "Test Using Larger Than Block-Size Key - Hash Key First",
        "out": "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
      }
    ],
    "pbkdf2": [
      {
        "pw": "password",
        "salt": "salt",
        "c": 1,
        "dk": 32,
        "out": "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b"
      },
      {
        "pw": "password",
        "salt": "salt",
        "c": 2,
        "dk": 32,
        "out": "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43"
      },
      {
        "pw": "password",
        "salt": "salt",
        "c": 4096,
        "dk": 32,
        "out": "c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a"
      },
      {
        "pw": "passwd",
        "salt": "salt",
        "c": 1,
        "dk": 64,
        "out": "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783"
      },
      {
        "pw": "Password",
        "salt_hex": "73616c74",
        "c": 4096,
        "dk": 20,
        "out": "75cf56214b1de1c7d7195bc01108f54b508f2af9"
      }
    ]
  },
  "utf8": [
    {
      "s": "Halo, dunia!",
      "hex": "48616c6f2c2064756e696121"
    },
    {
      "s": "absen-—-tepat",
      "hex": "616273656e2de280942d7465706174"
    },
    {
      "s": "日本語テスト",
      "hex": "e697a5e69cace8aa9ee38386e382b9e38388"
    }
  ]
};
if (typeof module !== 'undefined') module.exports = MC_VECTORS;
