from datetime import datetime, timedelta, timezone
from enum import Enum

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from .database import SessionLocal
from .models import SessionRow, TaskRow, UserRow
from .schemas import (
    PASSWORD_MAX_LENGTH,
    USERNAME_PATTERN,
    Priority,
    Status,
    Task,
    TaskCreate,
    User,
    normalize_username,
)
from .security import hash_password, hash_session_token, new_session_token, verify_dummy_password, verify_password

SESSION_LIFETIME = timedelta(days=7)


def utc_now() -> datetime:
    """DB에 저장하는 UTC 일시(시간대 정보 없음, 초 단위)."""
    return datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)


def to_task(row: TaskRow) -> Task:
    """DB 행을 API 응답 모델로 바꾼다. created_at은 UTC로 저장되어 있다."""
    return Task(
        id=row.id,
        title=row.title,
        description=row.description,
        status=row.status,
        priority=row.priority,
        due_date=row.due_date,
        created_at=row.created_at.replace(tzinfo=timezone.utc),
    )


def to_column_value(value: object) -> object:
    # Status·Priority 같은 Enum은 DB ENUM 컬럼에 맞게 문자열 값으로 저장한다.
    return value.value if isinstance(value, Enum) else value


class DbTaskStore:
    """MariaDB tasks 테이블에 할 일을 저장한다. 모든 메서드는 user_id의 할 일에만 적용된다."""

    def _owned_row(self, session, user_id: int, task_id: int) -> TaskRow | None:
        """user_id의 할 일이면 행을, 없거나 다른 사용자의 할 일이면 None을 반환한다(둘을 구분하지 않는다)."""
        row = session.get(TaskRow, task_id)
        return row if row is not None and row.user_id == user_id else None

    def list(
        self,
        user_id: int,
        q: str | None = None,
        status: Status | None = None,
        priority: Priority | None = None,
    ) -> list[Task]:
        """user_id의 할 일 중 조건을 모두 만족하는 것을 id 순서로 반환한다. None 조건은 무시한다."""
        statement = select(TaskRow).where(TaskRow.user_id == user_id).order_by(TaskRow.id)
        query = (q or "").strip().lower()
        if query:
            # %, _ 를 글자 그대로 검색하고, DB 정렬 규칙과 관계없이 소문자로 비교한다.
            statement = statement.where(
                func.lower(TaskRow.title).collate("utf8mb4_bin").contains(query, autoescape=True)
            )
        if status is not None:
            statement = statement.where(TaskRow.status == status.value)
        if priority is not None:
            statement = statement.where(TaskRow.priority == priority.value)
        with SessionLocal() as session:
            return [to_task(row) for row in session.scalars(statement)]

    def create(self, user_id: int, data: TaskCreate) -> Task:
        row = TaskRow(
            user_id=user_id,
            title=data.title,
            description=data.description,
            status=Status.TODO.value,
            priority=data.priority.value,
            due_date=data.due_date,
            created_at=utc_now(),
        )
        with SessionLocal() as session, session.begin():
            session.add(row)
            session.flush()
            return to_task(row)

    def update(self, user_id: int, task_id: int, changes: dict[str, object]) -> Task | None:
        """전달된 필드만 바꾼다. 없거나 다른 사용자의 id는 None을 반환한다."""
        with SessionLocal() as session, session.begin():
            row = self._owned_row(session, user_id, task_id)
            if row is None:
                return None
            for name, value in changes.items():
                setattr(row, name, to_column_value(value))
            session.flush()
            return to_task(row)

    def delete(self, user_id: int, task_id: int) -> bool:
        """삭제했으면 True, 없거나 다른 사용자의 id면 False를 반환한다."""
        with SessionLocal() as session, session.begin():
            row = self._owned_row(session, user_id, task_id)
            if row is None:
                return False
            session.delete(row)
            return True


def to_user(row: UserRow) -> User:
    """DB 행을 API 응답 모델로 바꾼다. password_hash는 포함하지 않는다."""
    return User(id=row.id, username=row.username, created_at=row.created_at.replace(tzinfo=timezone.utc))


class DbUserStore:
    """MariaDB users 테이블에 회원을 저장한다."""

    def create(self, username: str, password: str) -> User | None:
        """비밀번호를 해시해 회원을 만든다. 이미 있는 아이디면 None을 반환한다.

        username은 SignupRequest에서 소문자로 정규화된 값이다. 중복 여부는 DB의 UNIQUE 제약으로
        판단하므로 같은 아이디로 동시에 가입해도 한 명만 성공한다.
        """
        row = UserRow(
            username=username,
            password_hash=hash_password(password),
            created_at=utc_now(),
        )
        try:
            with SessionLocal() as session, session.begin():
                session.add(row)
                session.flush()
                return to_user(row)
        except IntegrityError:
            return None

    def authenticate(self, username: str, password: str) -> User | None:
        """아이디·비밀번호가 맞으면 User, 아니면 None. 실패 이유는 구분하지 않는다."""
        name = normalize_username(username)
        if not USERNAME_PATTERN.fullmatch(name) or len(password) > PASSWORD_MAX_LENGTH:
            verify_dummy_password(password[:PASSWORD_MAX_LENGTH])
            return None
        with SessionLocal() as session:
            row = session.scalars(select(UserRow).where(UserRow.username == name)).one_or_none()
        if row is None:
            verify_dummy_password(password)
            return None
        return to_user(row) if verify_password(row.password_hash, password) else None


class DbSessionStore:
    """MariaDB sessions 테이블에 로그인 세션을 저장한다. 세션 값 대신 SHA-256 해시를 저장한다."""

    def create(self, user_id: int) -> str:
        """세션을 만들고 쿠키에 넣을 세션 값을 반환한다. 만료는 지금부터 7일 뒤로 고정한다."""
        token = new_session_token()
        now = utc_now()
        with SessionLocal() as session, session.begin():
            session.add(
                SessionRow(token_hash=hash_session_token(token), user_id=user_id, created_at=now, expires_at=now + SESSION_LIFETIME)
            )
        return token

    def get_user(self, token: str) -> User | None:
        """유효한 세션의 사용자를 반환한다. 없거나 만료되었으면 None이며 만료된 세션은 지운다."""
        token_hash = hash_session_token(token)
        with SessionLocal() as session, session.begin():
            row = session.get(SessionRow, token_hash)
            if row is None:
                return None
            if row.expires_at <= utc_now():
                session.delete(row)
                return None
            user = session.get(UserRow, row.user_id)
            return to_user(user) if user is not None else None

    def delete(self, token: str) -> None:
        """세션을 지운다. 없는 세션이어도 오류 없이 끝난다."""
        with SessionLocal() as session, session.begin():
            session.execute(delete(SessionRow).where(SessionRow.token_hash == hash_session_token(token)))
