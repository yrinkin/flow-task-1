"""비밀번호 해시와 검증. 평문 비밀번호는 저장하거나 로그에 남기지 않는다."""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# Argon2id. 시간·메모리 비용은 argon2-cffi 기본값(RFC 9106 권장값)을 쓰며, 솔트는 해시마다 무작위로 만든다.
_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """솔트와 설정값이 포함된 해시 문자열을 반환한다. 같은 비밀번호도 매번 다른 값이 나온다."""
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """비밀번호가 해시와 맞으면 True. 틀리거나 해시 형식이 잘못되었으면 False."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False
