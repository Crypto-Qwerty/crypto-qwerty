import math
import hashlib
import re

print("==================================================")
print(" CryptoMatrix Python Verification Runner          ")
print("==================================================")

# 1. 4Q-1 PRNG
def fnv1a_hash(s: str) -> int:
    h = 2166136261
    for c in str(s):
        h ^= ord(c)
        h = (h * 16777619) & 0xFFFFFFFF
    return h

def create_rng(seed: str):
    a = fnv1a_hash(seed)
    def next_val():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * 61) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return next_val

def shuffle(arr, rng_fn):
    a = list(arr)
    for i in range(len(a) - 1, 0, -1):
        j = math.floor(rng_fn() * (i + 1))
        a[i], a[j] = a[j], a[i]
    return a

def pool(src, n, rng_fn):
    res = []
    while len(res) < n:
        res.extend(shuffle(src, rng_fn))
    return res[:n]

# Test PRNG
rng1 = create_rng("84920173")
rng2 = create_rng("84920173")
for _ in range(50):
    assert rng1() == rng2(), "PRNG determinism failed"
print("✔ PASS: 4Q-1 PRNG determinism verified")

# 2. 4Q-1 Board Generation
ROWS = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"]
]
KEYS = [k for row in ROWS for k in row]
assert len(KEYS) == 36, "Keys count must be 36"

UPPER = list("ABCDEFGHJKLMNPQRSTUVWXYZ")
LOWER = list("abcdefghijkmnpqrstuvwxyz")
NUM = list("23456789")
PIN = list("0123456789")
SAFE_SYMBOLS = list("!#$%&@")

FULL = UPPER + LOWER + NUM + SAFE_SYMBOLS
ALNUM = UPPER + LOWER + NUM

def generate_4q1_board(seed: str):
    r = create_rng(seed)
    f1 = pool(FULL, 36, r)
    f2 = pool(FULL, 36, r)
    al = pool(ALNUM, 36, r)
    pn = pool(PIN, 36, r)
    return [{
        "key": KEYS[i],
        "full1": f1[i],
        "full2": f2[i],
        "alnum": al[i],
        "pin": pn[i]
    } for i in range(36)]

board = generate_4q1_board("84920173")
assert len(board) == 36

# Verify Safe Symbols
for item in board:
    assert item["pin"] in "0123456789", f"PIN invalid: {item['pin']}"
    assert item["alnum"] in (UPPER + LOWER + NUM), f"ALNUM invalid: {item['alnum']}"
    for slot in [item["full1"], item["full2"]]:
        if slot not in (UPPER + LOWER + NUM):
            assert slot in SAFE_SYMBOLS, f"Symbol invalid: {slot}"
print("✔ PASS: 4Q-1 Safe Symbols strict adherence verified")

# 3. 4Q-1 Recipe Evaluation
def evaluate_4q1(site: str, secret: str, mode: str, max_len: int, board_data):
    s = (site + secret).upper()
    s = re.sub(r"[^A-Z0-9]", "", s) or "AMAZON"
    keys_needed = math.ceil(max_len / 2) if mode == "normal" else max_len
    while len(s) < keys_needed:
        s += s
    seq = s[:keys_needed]

    seen = {}
    steps = []
    for i, ch in enumerate(seq):
        seen[ch] = seen.get(ch, 0) + 1
        base_idx = KEYS.index(ch) if ch in KEYS else 0
        idx = (base_idx + seen[ch] - 1) % 36
        k = board_data[idx]
        if mode == "pin":
            steps.append(k["pin"])
        elif mode == "alnum":
            steps.append(k["alnum"])
        else: # normal
            alt = (i % 2 == 1)
            steps.append(k["full2"] if alt else k["full1"])
            steps.append(k["full1"] if alt else k["full2"])
    return "".join(steps[:max_len])

pw_normal = evaluate_4q1("AMAZON", "K7", "normal", 16, board)
pw_alnum = evaluate_4q1("AMAZON", "K7", "alnum", 12, board)
pw_pin = evaluate_4q1("AMAZON", "K7", "pin", 6, board)

print(f"✔ Sample 4Q-1 Normal Password: {pw_normal} (len={len(pw_normal)})")
print(f"✔ Sample 4Q-1 ALNUM Password:  {pw_alnum} (len={len(pw_alnum)})")
print(f"✔ Sample 4Q-1 PIN:             {pw_pin} (len={len(pw_pin)})")

assert len(pw_normal) == 16
assert len(pw_alnum) == 12
assert len(pw_pin) == 6
assert re.match(r"^[0-9]+$", pw_pin)

print("--------------------------------------------------")
print("🎉 All Python algorithmic verifications PASSED!")
print("==================================================")
