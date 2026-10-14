"""비밀번호 해시와 검증. 평문 비밀번호는 저장하거나 로그에 남기지 않는다."""

import hashlib
import secrets

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


# 없는 아이디로 로그인할 때도 같은 비용의 검증을 수행해 응답 시간으로 계정 존재를 알 수 없게 한다.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def verify_dummy_password(password: str) -> None:
    """결과를 쓰지 않는 검증. 없는 아이디·형식 오류일 때 시간 차이를 줄이려고 호출한다."""
    verify_password(_DUMMY_HASH, password)


def new_session_token() -> str:
    """쿠키에 넣을 세션 값(32바이트 무작위, URL 안전 문자열). DB에는 저장하지 않는다."""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """DB에 저장·조회할 세션 값의 SHA-256 해시(16진수 64자)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
