"""tasks 테이블에 user_id(users 외래키)를 추가한다. (T19)

실행: python -m backend.migrate_tasks_user_id --assign-to <아이디>

- 실행 전에 tasks를 백업한다. 이 스크립트는 행을 삭제하지 않는다.
- 소유자가 없는 기존 할 일은 --assign-to로 지정한 사용자에게 배정한다. 지정하지 않으면 아무것도 바꾸지 않고 멈춘다.
- MariaDB의 ALTER TABLE은 즉시 반영되므로 단계마다 적용 여부를 확인한다. 중간에 멈춰도 다시 실행하면 이어서 진행한다.
"""

import argparse
import sys

from sqlalchemy import inspect, text

from .database import engine
from .schemas import normalize_username

FK_NAME = "fk_tasks_user_id"
INDEX_NAME = "ix_tasks_user_id"


def column_info(conn) -> dict | None:
    return next((c for c in inspect(conn).get_columns("tasks") if c["name"] == "user_id"), None)


def has_foreign_key(conn) -> bool:
    return any(fk["name"] == FK_NAME for fk in inspect(conn).get_foreign_keys("tasks"))


def has_index(conn) -> bool:
    return any(ix["name"] == INDEX_NAME for ix in inspect(conn).get_indexes("tasks"))


def main() -> int:
    parser = argparse.ArgumentParser(description="tasks에 user_id를 추가하고 기존 할 일을 지정한 사용자에게 배정한다.")
    parser.add_argument("--assign-to", help="소유자가 없는 기존 할 일을 배정할 사용자 아이디")
    args = parser.parse_args()

    with engine.connect() as conn:
        column = column_info(conn)
        if column is not None and not column["nullable"] and has_index(conn) and has_foreign_key(conn):
            print("이미 적용되어 있어 변경하지 않았습니다.")
            return 0

        # 0) 바꾸기 전에 배정 대상을 확인한다. 문제가 있으면 아무것도 바꾸지 않고 멈춘다.
        if column is None:
            orphans = conn.execute(text("SELECT COUNT(*) FROM tasks")).scalar_one()
        else:
            orphans = conn.execute(text("SELECT COUNT(*) FROM tasks WHERE user_id IS NULL")).scalar_one()
        user_id = None
        if orphans:
            if not args.assign_to:
                print(f"소유자가 없는 할 일 {orphans}개가 있습니다. --assign-to <아이디>로 배정할 사용자를 지정하세요. 변경 없음.")
                return 1
            username = normalize_username(args.assign_to)
            user_id = conn.execute(text("SELECT id FROM users WHERE username = :u"), {"u": username}).scalar_one_or_none()
            if user_id is None:
                print(f"사용자 '{username}'을(를) 찾을 수 없습니다. 변경 없음.")
                return 1
        if conn.in_transaction():
            conn.commit()

        # 1) user_id 컬럼 추가(처음에는 NULL 허용)
        if column is None:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN user_id INT NULL AFTER id"))
            conn.commit()
            print("1) user_id 컬럼을 추가했습니다(NULL 허용).")
        else:
            print("1) user_id 컬럼이 이미 있습니다.")

        # 2) 소유자가 없는 행 배정
        if user_id is not None:
            updated = conn.execute(
                text("UPDATE tasks SET user_id = :uid WHERE user_id IS NULL"), {"uid": user_id}
            ).rowcount
            conn.commit()
            print(f"2) 소유자가 없던 할 일 {updated}개를 '{username}'(id {user_id})에게 배정했습니다.")
        else:
            print("2) 소유자가 없는 할 일이 없습니다.")
        if conn.in_transaction():
            conn.commit()

        # 3) NOT NULL로 변경
        if column_info(conn)["nullable"]:
            conn.execute(text("ALTER TABLE tasks MODIFY user_id INT NOT NULL"))
            conn.commit()
            print("3) user_id를 NOT NULL로 바꿨습니다.")
        else:
            print("3) user_id가 이미 NOT NULL입니다.")

        # 4) 인덱스와 외래키(사용자가 삭제되면 그 사용자의 할 일도 삭제)
        if not has_index(conn):
            conn.execute(text(f"ALTER TABLE tasks ADD INDEX {INDEX_NAME} (user_id)"))
            conn.commit()
            print(f"4) 인덱스 {INDEX_NAME}를 추가했습니다.")
        if not has_foreign_key(conn):
            conn.execute(
                text(f"ALTER TABLE tasks ADD CONSTRAINT {FK_NAME} FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE")
            )
            conn.commit()
            print(f"4) 외래키 {FK_NAME}(users.id, ON DELETE CASCADE)를 추가했습니다.")
    print("완료했습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
