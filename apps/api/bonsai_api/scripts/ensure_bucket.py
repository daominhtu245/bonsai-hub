"""Tạo bucket nếu chưa có (dùng cho S3 local khi phát triển; R2 thật tạo bucket trên dashboard)."""

from botocore.exceptions import ClientError

from ..settings import get_settings
from ..storage import _s3


def main() -> None:
    bucket = get_settings().r2_bucket
    s3 = _s3()
    try:
        s3.head_bucket(Bucket=bucket)
        print(f"bucket {bucket} exists")
    except ClientError:
        s3.create_bucket(Bucket=bucket)
        print(f"bucket {bucket} created")


if __name__ == "__main__":
    main()
