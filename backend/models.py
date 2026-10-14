from datetime import date, datetime

from sqlalchemy import CHAR, Date, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class TaskRow(Base):
    """tasks 테이블. 값 규칙은 API-SPEC.md의 Task 객체와 같다."""

    __tablename__ = "tasks"
    __table_args__ = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # 할 일의 소유자(T19). 기존 DB에는 backend.migrate_tasks_user_id로 추가한다.
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE", name="fk_tasks_user_id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(2000), nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(
        Enum("TODO", "DOING", "DONE", name="task_status"),
        nullable=False,
        default="TODO",
        server_default="TODO",
    )
    priority: Mapped[str] = mapped_column(
        Enum("HIGH", "NORMAL", "LOW", name="task_priority"),
        nullable=False,
        default="NORMAL",
        server_default="NORMAL",
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # UTC 기준 등록 일시. 시간대 정보 없이 저장하고 API 응답에서 UTC로 표시한다.
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class UserRow(Base):
    """users 테이블. username은 소문자로 저장하고, 비밀번호는 Argon2id 해시만 저장한다."""

    __tablename__ = "users"
    __table_args__ = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # UTC 기준 가입 일시
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class SessionRow(Base):
    """sessions 테이블. 쿠키의 세션 값은 저장하지 않고 SHA-256 해시(16진수 64자)만 저장한다."""

    __tablename__ = "sessions"
    __table_args__ = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}

    token_hash: Mapped[str] = mapped_column(CHAR(64), primary_key=True)
    # 사용자가 삭제되면 그 사용자의 세션도 함께 삭제된다.
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # UTC 기준 로그인 일시와 만료 일시(로그인 후 7일)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
