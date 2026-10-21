"""Sinh cặp khóa VAPID cho Web Push: python -m bonsai_worker.scripts.gen_vapid → dán vào .env."""

import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def generate() -> tuple[str, str]:
    v = Vapid02()
    v.generate_keys()
    private = v.private_key.private_numbers().private_value.to_bytes(32, "big")
    public = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return b64url(public), b64url(private)


if __name__ == "__main__":
    pub, priv = generate()
    print(f"VAPID_PUBLIC_KEY={pub}\nVAPID_PRIVATE_KEY={priv}")
