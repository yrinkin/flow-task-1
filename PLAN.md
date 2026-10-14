# Task Flow PLAN
## 작업 원칙
한 번에 아래 작업 하나만 구현한다. 실제 확인 전에는 완료로 표시하지 않는다.
상태는 [ ] 미완료, [x] 확인 완료로 관리하고 확인 결과를 각 항목 아래 기록한다.
## 2장: 브라우저 앱
- [x] T01: frontend/index.html, styles.css, app.js 생성. 제목 입력·등록·목록만 구현한다.
  확인: 두 항목 등록, 빈 제목 거절. 이 단계에서 새로고침하면 사라져도 정상이다.
  기록(2026-10-13): frontend/index.html, styles.css, app.js 생성.
  Node DOM 스텁 테스트 통과(두 항목 등록, 빈·공백 제목 거절, 101자 거절, 100자 등록, HTML 글자 표시).
  http.server 5500에서 세 파일 200 응답.
  Windows 브라우저(http://localhost:5500, WSL localhostForwarding)에서 사용자 확인 정상. 남은 오류 없음.
- [x] T02: localStorage(task-flow-v1) 저장·복원.
  확인: 새로고침 후 유지. 손상된 저장값을 자동 덮어쓰지 않는다.
  기록(2026-10-13): frontend/app.js 저장·복원 추가, index.html에 저장 오류 영역·버튼 id 추가, styles.css 비활성 스타일.
  Node 스텁 테스트 통과(저장, 재실행 후 복원, 손상값 4종에서 등록 중지·원래 값 유지, 저장 실패 시 되돌림, T01 회귀).
  http.server 세 파일 200 응답.
  Windows 브라우저에서 사용자 확인 정상(새로고침 후 유지, 손상값 입력 시 등록 중지). 남은 오류 없음.
- [x] T03: 상태 변경, 수정, 삭제 확인.
  확인: 삭제 취소 시 유지. 다른 항목이 수정되지 않는다.
  기록(2026-10-13): frontend/app.js 상태 선택·제목 수정·삭제 확인 추가(id 기준), styles.css 항목 버튼·완료 스타일.
  설명 수정은 T04에서 다룬다. 저장 실패 시 변경을 되돌린다. status 없는 기존 저장값은 TODO로 읽는다.
  Node 스텁 테스트 12개 통과(상태 변경, 빈 제목 수정 거절, 수정·취소·Esc, 삭제 취소 유지, 삭제 시 해당 항목만, 재실행 후 유지, 저장 실패 되돌림, 회귀).
  Windows 브라우저에서 사용자 확인 정상(상태 변경·수정·삭제 취소·삭제, 새로고침 후 유지). 남은 오류 없음.
- [x] T04: 설명·우선순위·마감일·검색·필터·지연 표시.
  확인: 필터 중 수정·삭제, 어제 마감 TODO의 지연 표시.
  기록(2026-10-13): index.html 등록 폼(우선순위·마감일·설명)과 검색·필터 영역 추가, app.js 필드·검증·수정 폼·필터·지연 표시, styles.css 배지·필터 스타일.
  수정 폼에서 제목·설명·우선순위·마감일을 함께 수정한다. 이전 단계 저장값은 빠진 필드를 기본값으로 읽는다.
  Node 스텁 테스트 통과: T04 12개(기본값, 검증, 지연 표시, 검색·필터 AND, 필터 중 수정·삭제, 호환·손상값, 새로고침 유지), T03 회귀 12개.
  Windows 브라우저에서 사용자 확인 정상(어제 마감 TODO 지연 표시, 필터 AND, 필터 중 수정·삭제, 새로고침 유지). 남은 오류 없음.
## 3장: API
- [x] T05: API-SPEC.md 작성, FastAPI /api/health 구현.
  확인: curl로 200과 status=ok.
  기록(2026-10-13): API-SPEC.md(T05~T08 계약), backend/__init__.py, backend/main.py, requirements.txt(fastapi 0.143.0, uvicorn 0.54.0), .gitignore 생성.
  실행: .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 (Python 3.10.12)
  결과: curl -i /api/health → 200, {"status":"ok"}. /docs 200, 없는 경로 404. 남은 오류 없음.
- [x] T06: 메모리 기반 /api/tasks GET과 POST.
  확인: /docs에서 등록 후 조회. 입력 위반은 422.
  기록(2026-10-13): backend/schemas.py(TaskCreate·Task 검증), backend/store.py(메모리 저장소), backend/main.py에 GET·POST /api/tasks 추가.
  수정: due_date strict 검증이 "2026-10-20"까지 거절해 YYYY-MM-DD 형식 검사 후 날짜 변환하도록 변경.
  실행: 포트 8001에서 uvicorn 실행 후 urllib 스크립트로 확인. 26개 통과(기본값 201, 경계값 201, 위반 18종 422, GET id 순서, 재시작 후 빈 목록).
  /docs 화면에서 사용자 확인 정상(등록 201, 빈 제목 422, 등록 후 조회). 남은 오류 없음.
- [x] T07: PATCH·DELETE와 필터 구현.
  확인: 미전달 필드 유지, 없는 ID 404, 삭제 204.
  기록(2026-10-13): backend/schemas.py TaskUpdate(보낸 필드만 수정, due_date만 null 허용), backend/store.py update·delete·필터, backend/main.py PATCH·DELETE와 q·status·priority 쿼리.
  실행: 포트 8001에서 uvicorn 실행 후 urllib 스크립트로 확인. T07 41개 통과(부분 수정 시 나머지·다른 항목 유지, due_date null 삭제, PATCH 위반 14종 422, 없는 id 404, 삭제 204·재삭제 404, q·status·priority AND, 잘못된 필터 422). T06 회귀 25개 통과.
  남은 오류 없음.
- [x] T08: 프런트엔드 저장 처리를 API 호출로 교체.
  확인: 화면과 curl 목록이 같음. API 중지 시 오류 표시.
  기록(2026-10-13): frontend/app.js localStorage 제거, 목록·등록·상태 변경·수정·삭제를 /api 호출로 교체, 검색·필터는 API 쿼리(q·status·priority)로 조회, 지연 표시는 화면에서 계산.
  backend/main.py에 frontend 정적 파일 제공 추가(같은 주소, CORS 불필요), index.html 오류 영역 id를 api-error로 변경, API-SPEC.md에 화면 제공 방식 추가.
  실행: 포트 8001 uvicorn + Node 스텁(실제 HTTP 요청) 테스트 12개 통과(등록 후 화면·curl 목록 동일, 필터 중 수정·삭제, 404 안내, API 중지 시 오류 표시). T07 API 회귀 41개 통과.
  Windows 브라우저(http://localhost:8000)에서 사용자 확인 정상(화면·curl 목록 동일, API 중지 시 오류 표시). 남은 오류 없음.
## 4장: DB
- [x] T09: MariaDB 전용 사용자·DB와 .env 준비. 접속 확인.
  기록(2026-10-13): MariaDB 10.6.23(127.0.0.1:3306). 사용자가 task_flow DB와 task_flow_app@localhost 생성, .env 작성. .env.example(가짜 값) 추가, .env 권한 600, .gitignore 대상 확인.
  결과: .env 정보로 mariadb 접속 성공(CURRENT_USER task_flow_app@localhost, DATABASE task_flow, utf8mb4_general_ci, 테이블 없음).
  참고: 권한이 ALL PRIVILEGES(DROP 포함)로 부여됨. 비밀번호가 짧아 서버 분리(T12) 전 변경 권장.
- [x] T10: backend/database.py, models.py, init_db.py 생성.
  확인: python -m backend.init_db 실행 후 tasks 테이블 확인.
  기록(2026-10-13): requirements.txt에 SQLAlchemy 2.0.54, PyMySQL 1.2.3 추가. database.py(.env·환경변수 읽기, 엔진·세션), models.py(TaskRow), init_db.py(없는 테이블만 생성) 작성.
  실행: python -m backend.init_db 2회 → 1회차 생성, 2회차 "이미 있어 변경하지 않음".
  결과: DESCRIBE tasks로 id(AUTO_INCREMENT PK)·title varchar(100)·description varchar(2000)·status·priority ENUM·due_date date NULL·created_at datetime 확인. InnoDB, utf8mb4, 0행. 접속 정보 누락 시 안내 오류 확인. 남은 오류 없음.
- [x] T11: API 메모리 저장을 DB로 교체.
  확인: 등록한 행을 SQL로 조회. API 재시작 후 데이터 유지.
  기록(2026-10-13): backend/store.py를 DbTaskStore(MariaDB, 메서드 동일)로 교체, backend/main.py가 DbTaskStore 사용·DB 오류 시 503 응답. API-SPEC.md에 503 추가.
  실행: 포트 8001 uvicorn + urllib 스크립트. 31개 통과(등록·부분 수정·422·404·204, q·status·priority AND, q의 %·_ 글자 검색, 2000자 설명·이모지 저장).
  결과: 등록 행을 mariadb SELECT로 확인. API 재시작 후 같은 id·수정 내용 유지. 틀린 DB 비밀번호로 실행 시 /api/tasks 503, 로그에 비밀번호 미노출.
  테스트 항목([T11검증] 제목)은 확인 후 삭제해 tasks는 0행. AUTO_INCREMENT는 6부터 시작. 남은 오류 없음.
## 5장: 서버 분리
- [x] T12: DB 서버 구성 후 App 서버에서 SELECT 1 확인.
  기록(2026-10-14): 사용자가 서버에서 직접 구성하고 완료를 보고함. Claude는 서버에 접속하지 못해 직접 확인하지 않음.
  세부 결과(DB 서버 주소, bind-address, 'task_flow_app'@App IP 계정, 3306 방화벽, App 서버의 SELECT 1 결과)는 아직 기록되지 않음.
- [x] T13: App 서버 코드·가상환경·환경변수·systemd 구성.
  확인: App에서 /api/health 응답.
  기록(2026-10-14): App 서버는 이 PC(WSL), 코드는 현재 위치에서 실행. 변경 파일 deploy/task-flow-api.service, deploy/api.env.example(신규, 가짜 값).
  가상환경: clone된 .venv(다른 PC의 Python 3.10)가 동작하지 않아 python3 -m venv .venv로 재생성(Python 3.14.4), pip install -r requirements.txt.
  사용자 실행(sudo): /etc/task-flow/api.env 생성(root:root 600, .env의 DB_* + APP_HOST=127.0.0.1, APP_PORT=8000), 서비스 파일 복사, daemon-reload, enable --now.
  확인: systemd-analyze verify 오류 없음. task-flow-api active·enabled, 실행 계정 kyrin4321, --reload 없이 127.0.0.1:8000 대기.
  curl /api/health 200 {"status":"ok"}, /api/tasks 8개(DB), / 화면 200. kill -9 후 systemd가 자동 재시작(NRestarts=1), 데이터 유지. 로그에 비밀번호 없음. 남은 오류 없음.
  사용자 확인(2026-10-14): sudo systemctl stop/start task-flow-api.service로 중지·시작과 /api/health 응답 정상.
- [x] T14: Web 서버 Nginx와 정적 파일·/api 프록시 구성.
  확인: Web 주소로 등록, DB 저장, App 재시작 후 유지.
  기록(2026-10-14): Web 서버는 이 PC(WSL), Nginx 1.28.3. 변경 파일 deploy/nginx-task-flow.conf(신규), backend/main.py(정적 파일 제공 제거, 8000은 API·/docs만), API-SPEC.md(화면 제공 항목).
  사용자 실행(sudo): frontend 3개 파일을 /var/www/task-flow에 복사(root 644), 사이트 설정 등록·default 비활성화, nginx -t 후 reload, task-flow-api 재시작.
  사전 시험: 같은 server 블록을 임시 Nginx(18080)로 실행해 nginx -t 통과, 경로별 응답·프록시·413 확인.
  확인: Web(80) / 200(Cache-Control no-cache)·/api/health·/api/tasks 200·/docs 404, App(8000) / 404·/api/health 200.
  Web 주소로 등록(id 33, 201)·PATCH 200 → SQL 조회로 DB 저장 확인 → App 재시작(사용자 systemctl start) 후 Web 주소로 같은 id·상태 유지.
  오류: 재시작 확인 중 kill(SIGTERM)로 정상 종료되어 Restart=on-failure가 동작하지 않고 서비스가 멈춤(Web /api 502). 사용자가 systemctl start로 복구. 남은 오류 없음.
  점검용 항목(id 33)은 확인 후 Web 주소로 삭제(204).
## 6장: 회원 기능 (PRD F10~F15)
- [x] T15: API-SPEC.md에 회원·인증 계약 추가. 코드는 변경하지 않는다.
  내용: POST /api/auth/signup·login·logout, GET /api/auth/me, 세션 쿠키 규칙, /api/tasks 인증 필수와 401·404·409 응답.
  확인: PRD F10~F15와 보안 항목이 명세에 모두 반영되었는지 사용자 검토.
  기록(2026-10-14): API-SPEC.md에 상태 코드 401·409·429, 인증 공통(tf_session 쿠키 속성, 7일 고정 만료, DB 세션), User 객체,
  POST /api/auth/signup·login·logout, GET /api/auth/me, 할 일 API 공통(로그인 필수, 다른 사용자 id 404), 저장 단계(T19 user_id) 추가. 코드 변경 없음.
  사용자 검토(2026-10-14): 명세 확인 완료. 가입 후 자동 로그인 없음, 가입 409로 아이디 존재가 알려지는 점 수용.
- [ ] T16: users·sessions 모델과 비밀번호 해시 함수. 필요한 패키지는 목적과 함께 requirements.txt에 기록한다.
  확인: python -m backend.init_db로 users·sessions 테이블 생성, 기존 tasks는 변경 없음. 해시 결과가 평문과 다르고 같은 비밀번호도 매번 다른 값이며 검증은 성공.
- [ ] T17: 회원가입 API POST /api/auth/signup.
  확인: 정상 가입 201, 대소문자만 다른 중복 아이디 409, 규칙 위반 422, SQL로 password_hash에 평문이 없음.
- [ ] T18: 로그인·로그아웃·내 정보 API와 세션 쿠키.
  확인: 로그인 200과 HttpOnly·SameSite=Lax 쿠키, 틀린 아이디·비밀번호 모두 같은 401 안내, /api/auth/me 200,
  로그아웃 204 후 같은 쿠키로 me 401, App 재시작 후 세션 유지, 만료된 세션 401.
- [ ] T19: tasks에 user_id(users 외래키) 추가 마이그레이션과 기존 데이터 처리.
  확인: 실행 전 tasks 백업 파일 생성, 기존 행 처리 방법을 사용자에게 확인받은 뒤 실행, DESCRIBE tasks로 user_id NOT NULL·외래키 확인.
- [ ] T20: /api/tasks 인증 필수와 사용자별 데이터 분리.
  확인: 미로그인 401, 사용자 A·B가 각자 등록한 할 일만 조회·검색·필터, A가 B의 id로 PATCH·DELETE 시 404이고 B의 데이터 유지. T07 API 회귀 통과.
- [ ] T21: 화면에 회원가입·로그인·로그아웃 추가, 로그인한 아이디 표시, 401 응답 시 로그인 화면으로 이동.
  확인: 브라우저에서 가입 → 로그인 → 할 일 등록 → 로그아웃 → 다른 계정 로그인 시 이전 계정의 할 일이 보이지 않음. 아이디·오류 문구는 글자로 표시.
- [ ] T22: 배포 반영. App 재시작, 화면 파일을 /var/www/task-flow에 복사, Nginx에서 /api/auth/login 요청 횟수 제한.
  확인: Web 주소로 A·B 시나리오 재확인, App 재시작 후 로그인 유지, 짧은 시간 반복 로그인 시 429.
## 실행 기준
T01~T04: python3 -m http.server 5500 --bind 127.0.0.1 --directory frontend
T05~T11: 가상환경에서 python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
T13~: App은 systemd(task-flow-api) 서비스로 실행한다. 코드 변경 후 sudo systemctl restart task-flow-api.
T14~: 화면은 Web 주소(Nginx, http://127.0.0.1)로 연다. 화면 변경 후 sudo install -m 644 frontend/* /var/www/task-flow/.
T15~: 개발 중 확인은 다른 포트(예: 8001)에서 uvicorn을 따로 실행해 하고, 운영 서비스(8000)는 확인이 끝난 뒤 재시작한다.
실제 존재하는 파일을 확인한 뒤 명령을 실행한다.
## 기록
각 작업에 변경 파일, 실행 명령, 실제 확인 결과, 남은 오류를 기록한다.
정상 동작을 확인한 작업 단위로 Git 커밋한다.