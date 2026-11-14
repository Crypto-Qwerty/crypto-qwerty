#!/usr/bin/env python3
"""Independent Python verification of the CM-BOARD-V3 HMAC RNG."""
import hashlib
import hmac
import unicodedata

MASK32 = 0xFFFFFFFF
DOMAIN = b"CM-BOARD-V3"

class HmacCounterRng:
    def __init__(self, seed):
        normalized = unicodedata.normalize("NFC", str(seed).strip())
        self.key = normalized.encode("utf-8")
        self.counter = 0
        self.block = b""
        self.offset = 0

    def _next_block(self):
        if self.counter > MASK32:
            raise OverflowError("CM-BOARD-V3 counter overflow")
        message = DOMAIN + b"\x00" + self.counter.to_bytes(4, "big")
        self.block = hmac.new(self.key, message, hashlib.sha256).digest()
        self.counter += 1
        self.offset = 0

    def next_uint32(self):
        if self.offset + 4 > len(self.block):
            self._next_block()
        value = int.from_bytes(self.block[self.offset:self.offset + 4], "big")
        self.offset += 4
        return value

    def next_int(self, n):
        if not isinstance(n, int) or n <= 0 or n > 0x100000000:
            raise ValueError("invalid range")
        limit = 0x100000000 - (0x100000000 % n)
        while True:
            word = self.next_uint32()
            if word < limit:
                return word % n

    def shuffle(self, values):
        result = list(values)
        for i in range(len(result) - 1, 0, -1):
            j = self.next_int(i + 1)
            result[i], result[j] = result[j], result[i]
        return result


def generate_board(seed):
    rng = HmacCounterRng(seed)
    upper = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    lower = list("abcdefghijklmnopqrstuvwxyz")
    digits = list("0123456789")
    symbols = list("!#$%&@")

    full1 = rng.shuffle(rng.shuffle(symbols) + rng.shuffle(upper)[:10]
                        + rng.shuffle(lower)[:10] + rng.shuffle(digits)[:10])
    full2 = rng.shuffle(rng.shuffle(symbols) + rng.shuffle(upper)[:10]
                        + rng.shuffle(lower)[:10] + rng.shuffle(digits)[:10])
    alnum = rng.shuffle(rng.shuffle(upper)[:13] + rng.shuffle(lower)[:13]
                        + rng.shuffle(digits)[:10])
    pin_base = digits * 3 + rng.shuffle(digits)[:6]
    pin = rng.shuffle(pin_base)
    return [(full1[i], full2[i], alnum[i], pin[i]) for i in range(36)]


def main():
    # RFC 4231 HMAC-SHA-256 test cases 1 and 2.
    tc1 = hmac.new(bytes([0x0B]) * 20, b"Hi There", hashlib.sha256).hexdigest()
    assert tc1 == "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
    tc2 = hmac.new(b"Jefe", b"what do ya want for nothing?", hashlib.sha256).hexdigest()
    assert tc2 == "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"

    golden = generate_board("84920173")
    assert golden[0] == ("D", "Q", "I", "8"), golden[0]
    assert golden[1] == ("s", "9", "1", "9"), golden[1]

    board_007 = generate_board("007")
    board_7 = generate_board("7")
    assert board_007[0][0] == "3", board_007[0]
    assert board_7[0][0] == "9", board_7[0]
    assert board_007 != board_7

    for seed in ("84920173", "007", "Ab3dEf7hJk2m", "MySeed2026"):
        board = generate_board(seed)
        assert len(board) == 36
        for full1, full2, alnum, pin in board:
            assert full1 in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&@"
            assert full2 in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&@"
            assert alnum in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
            assert pin in "0123456789"

    print("PASS: RFC 4231 HMAC-SHA-256 vectors 1/2")
    print("PASS: independent CM-BOARD-V3 HMAC counter-mode board vectors")
    print("PASS: leading-zero seed distinction (007 != 7)")
    print("PASS: 36-key slot character constraints")

if __name__ == "__main__":
    main()
