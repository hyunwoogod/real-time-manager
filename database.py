import sqlite3
import json
import os
import re
import datetime
import shutil
from werkzeug.security import generate_password_hash, check_password_hash

# ==============================================================================
# DB 연결: DATABASE_URL 환경변수가 있으면 PostgreSQL(Supabase), 없으면 로컬 SQLite
# ==============================================================================
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
USE_POSTGRES = bool(DATABASE_URL)

if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras
    import psycopg2.pool
    IntegrityError = psycopg2.IntegrityError
else:
    IntegrityError = sqlite3.IntegrityError


def get_db_path():
    """Render 배포 환경(Persistent Disk) 및 로컬 환경에 최적화된 SQLite 데이터베이스 경로 확인"""
    # 1. 환경 변수 DATABASE_PATH 지정 시 우선 적용
    env_path = os.environ.get('DATABASE_PATH')
    if env_path:
        os.makedirs(os.path.dirname(os.path.abspath(env_path)), exist_ok=True)
        return os.path.abspath(env_path)

    # 2. Render Persistent Disk 기본 경로 (/var/data 또는 DATA_DIR)
    data_dir = os.environ.get('DATA_DIR', '')
    if data_dir and os.path.exists(data_dir):
        return os.path.abspath(os.path.join(data_dir, 'baseball.db'))
    if os.path.exists('/var/data'):
        return '/var/data/baseball.db'

    # 3. 프로젝트 루트 기본 경로
    return os.path.abspath(os.path.join(os.path.dirname(__file__), 'baseball.db'))

DB_PATH = None if USE_POSTGRES else get_db_path()

# Render 영구 디스크로 마운트된 경우, 저장소 내 기본 DB 파일이 있으면 최초 1회 자동 동기화 복사
repo_db = os.path.abspath(os.path.join(os.path.dirname(__file__), 'baseball.db'))
if DB_PATH and DB_PATH != repo_db and not os.path.exists(DB_PATH) and os.path.exists(repo_db):
    try:
        shutil.copy2(repo_db, DB_PATH)
        print(f"⚾ [DB] Render 영구 디스크로 초기 DB 파일 동기화 완료: {DB_PATH}")
    except Exception as e:
        print(f"⚠️ [DB] 영구 디스크 복사 안내: {e}")


def _to_pg_sql(sql):
    """SQLite 자리표시자(?)를 psycopg2 자리표시자(%s)로 변환"""
    return sql.replace('%', '%%').replace('?', '%s')


class _PGCursor:
    """sqlite3 커서와 같은 방식(execute/fetchone/fetchall, row['col'])으로 쓰기 위한 래퍼"""
    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql, params=()):
        self._cur.execute(_to_pg_sql(sql), tuple(params))
        return self

    def executemany(self, sql, seq):
        psycopg2.extras.execute_batch(self._cur, _to_pg_sql(sql), [tuple(p) for p in seq])

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()


class _PGConnection:
    def __init__(self, pool, conn):
        self._pool = pool
        self._conn = conn

    def cursor(self):
        return _PGCursor(self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor))

    def execute(self, sql, params=()):
        if sql.strip().upper().startswith('PRAGMA'):
            return None
        return self.cursor().execute(sql, params)

    def commit(self):
        self._conn.commit()

    def close(self):
        if self._conn is None:
            return
        try:
            # 커밋하지 않은 작업이나 오류로 중단된 트랜잭션을 정리한 뒤 풀에 반납
            self._conn.rollback()
            self._pool.putconn(self._conn)
        except Exception:
            self._pool.putconn(self._conn, close=True)
        self._conn = None


_pg_pool = None

def _get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        _pg_pool = psycopg2.pool.ThreadedConnectionPool(
            1, 5, DATABASE_URL,
            connect_timeout=10, keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=3
        )
    return _pg_pool


def get_db():
    if USE_POSTGRES:
        pool = _get_pg_pool()
        conn = pool.getconn()
        if conn.closed:
            pool.putconn(conn, close=True)
            conn = pool.getconn()
        return _PGConnection(pool, conn)

    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
    except Exception:
        pass
    return conn


def _ddl(sql):
    """SQLite용 CREATE TABLE 문을 PostgreSQL 문법으로 변환"""
    if not USE_POSTGRES:
        return sql
    return (sql.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY')
               .replace('DATETIME', 'TIMESTAMP')
               .replace('BOOLEAN NOT NULL DEFAULT 0', 'INTEGER NOT NULL DEFAULT 0'))


def _table_columns(cursor, table):
    if USE_POSTGRES:
        cursor.execute(
            "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?",
            (table,)
        )
    else:
        cursor.execute(f"PRAGMA table_info({table})")
    return [row['name'] for row in cursor.fetchall()]


def _insert_returning_id(cursor, sql, params):
    if USE_POSTGRES:
        cursor.execute(sql + " RETURNING id", params)
        return cursor.fetchone()['id']
    cursor.execute(sql, params)
    return cursor.lastrowid


# ==============================================================================
# 비밀번호 해시 (평문 저장 금지)
# ==============================================================================
def hash_password(password):
    return generate_password_hash(password, method='pbkdf2:sha256')


def _is_password_hash(stored):
    return bool(stored) and stored.startswith(('pbkdf2:', 'scrypt:'))


KST = datetime.timezone(datetime.timedelta(hours=9))

def _to_kst_str(value):
    """DB의 UTC 시각(datetime 또는 'YYYY-MM-DD HH:MM:SS' 문자열)을 한국 시간 문자열로 변환"""
    if not value:
        return value
    if isinstance(value, str):
        try:
            value = datetime.datetime.strptime(value[:19], '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(KST).strftime('%Y-%m-%d %H:%M:%S')


def _public_user(row):
    """DB 사용자 레코드에서 비밀번호를 제거하고 기본값을 보정한 dict 반환 (API 응답/세션용)"""
    if not row:
        return None
    user = dict(row)
    user.pop('password', None)
    if not user.get('favorite_team'):
        user['favorite_team'] = user.get('team')
    if not user.get('nickname'):
        user['nickname'] = user.get('username') or '감독'
    if user.get('created_at'):
        user['created_at'] = _to_kst_str(user['created_at'])
    return user


def init_db():
    if USE_POSTGRES:
        print("⚾ [DB] PostgreSQL(DATABASE_URL) 데이터베이스 사용")
    else:
        print(f"⚾ [DB] SQLite 데이터베이스 사용: {DB_PATH}")
        if os.environ.get('RENDER'):
            print("⚠️ [DB] Render에서 SQLite를 사용 중입니다. 재배포/재시작 시 회원 데이터가 사라질 수 있으니 DATABASE_URL을 설정하세요.")

    conn = get_db()
    cursor = conn.cursor()

    # 회원가입 유저 테이블
    cursor.execute(_ddl('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT NOT NULL,
            nickname TEXT NOT NULL,
            team TEXT NOT NULL DEFAULT '한화',
            favorite_team TEXT NOT NULL DEFAULT '한화',
            avatar TEXT NOT NULL DEFAULT '👑',
            score INTEGER NOT NULL DEFAULT 2000,
            grade TEXT NOT NULL DEFAULT 'B',
            marketing_agreed INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    '''))

    # favorite_team 및 nickname 컬럼 존재 여부 확인 및 자동 마이그레이션
    user_cols = _table_columns(cursor, 'users')
    if 'nickname' not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT ''")
        cursor.execute("UPDATE users SET nickname = username WHERE nickname IS NULL OR nickname = ''")
        conn.commit()
    if 'favorite_team' not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN favorite_team TEXT DEFAULT '한화'")
        cursor.execute("UPDATE users SET favorite_team = team WHERE favorite_team IS NULL OR favorite_team = ''")
        conn.commit()

    # 친구 관계 테이블
    cursor.execute(_ddl('''
        CREATE TABLE IF NOT EXISTS user_friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, friend_id)
        )
    '''))

    # 기존 유저 랭킹 테이블 (하위 호환성 유지)
    cursor.execute(_ddl('''
        CREATE TABLE IF NOT EXISTS user_rankings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            team TEXT NOT NULL,
            avatar TEXT NOT NULL,
            score INTEGER NOT NULL,
            grade TEXT NOT NULL,
            is_me BOOLEAN NOT NULL DEFAULT 0
        )
    '''))

    # 감독 작전 로그
    cursor.execute(_ddl('''
        CREATE TABLE IF NOT EXISTS tactics_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inning TEXT NOT NULL,
            situation TEXT NOT NULL,
            tactic_chosen TEXT NOT NULL,
            score_change INTEGER NOT NULL,
            result_grade TEXT NOT NULL,
            commentary TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    '''))

    # 2026 KBO 9~10월 공식 일정 테이블
    cursor.execute(_ddl('''
        CREATE TABLE IF NOT EXISTS kbo_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_date TEXT NOT NULL,
            day_of_week TEXT NOT NULL,
            start_time TEXT NOT NULL,
            home_team TEXT NOT NULL,
            away_team TEXT NOT NULL,
            stadium TEXT NOT NULL,
            home_pitcher TEXT DEFAULT '',
            away_pitcher TEXT DEFAULT '',
            status_text TEXT DEFAULT '경기전',
            is_rest_day INTEGER NOT NULL DEFAULT 0
        )
    '''))

    # 로그인 기록 (성공/실패 모두 기록, 관리자 콘솔에서 조회)
    cursor.execute(_ddl('''
        CREATE TABLE IF NOT EXISTS login_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT NOT NULL,
            success INTEGER NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            ip TEXT NOT NULL DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    '''))

    cols = _table_columns(cursor, 'kbo_schedules')
    if "home_pitcher" not in cols:
        cursor.execute("ALTER TABLE kbo_schedules ADD COLUMN home_pitcher TEXT DEFAULT ''")
    if "away_pitcher" not in cols:
        cursor.execute("ALTER TABLE kbo_schedules ADD COLUMN away_pitcher TEXT DEFAULT ''")
    if "status_text" not in cols:
        cursor.execute("ALTER TABLE kbo_schedules ADD COLUMN status_text TEXT DEFAULT '경기전'")

    # 회원가입에서 이메일을 받지 않으므로, 예전에 자동으로 채워 넣은 가짜 이메일(아이디@zipgamdok.com) 제거
    cursor.execute("UPDATE users SET email = '' WHERE email = username || '@zipgamdok.com'")

    if USE_POSTGRES:
        # Supabase는 public 스키마 테이블을 공개 키(publishable/anon key)로 REST API에 노출하므로
        # RLS를 켜서 외부 접근을 차단 (서버는 테이블 소유자 계정으로 접속하므로 영향 없음)
        for table in ('users', 'user_friends', 'user_rankings', 'tactics_history', 'kbo_schedules', 'login_logs'):
            cursor.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    conn.commit()
    conn.close()

    # KBO 경기 일정 시딩
    seed_kbo_schedules()
    # 예전에 평문으로 저장된 비밀번호를 해시로 일괄 전환
    migrate_plaintext_passwords()

def migrate_plaintext_passwords():
    """평문 비밀번호가 남아 있으면 해시로 변환 (이미 해시된 값은 건드리지 않음)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, password FROM users")
    targets = [(hash_password(r['password']), r['id']) for r in cursor.fetchall() if not _is_password_hash(r['password'])]
    if targets:
        cursor.executemany("UPDATE users SET password = ? WHERE id = ?", targets)
        conn.commit()
        print(f"⚾ [DB] 평문 비밀번호 {len(targets)}건을 해시로 전환했습니다.")
    conn.close()

def seed_mock_users():
    """테스트용 가상 유저 시딩 (데이터 초기화 요청에 따라 비활성화)"""
    pass

def clear_all_users():
    """모든 회원 데이터 및 관련 친구 데이터 초기화 (완전 빈 상태로 초기화)"""
    conn = get_db()
    cursor = conn.cursor()
    if USE_POSTGRES:
        cursor.execute("TRUNCATE user_friends, users RESTART IDENTITY")
        conn.commit()
    else:
        cursor.execute("DELETE FROM user_friends")
        cursor.execute("DELETE FROM users")
        try:
            cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('users', 'user_friends')")
        except Exception:
            pass
        conn.commit()
        cursor.execute("VACUUM")
    conn.close()
    return {"status": "success", "message": "모든 회원 데이터가 성공적으로 초기화되었습니다."}

def validate_username_format(username):
    """아이디 유효성 검사: 영문 + 숫자 조합으로 8자 이상"""
    if not username:
        return False, "아이디를 입력해 주세요."
    u = username.strip()
    if len(u) < 8:
        return False, "아이디는 영문과 숫자를 조합하여 8자 이상 입력해 주세요."
    has_letter = any(c.isalpha() for c in u)
    has_digit = any(c.isdigit() for c in u)
    if not (has_letter and has_digit):
        return False, "아이디는 영문과 숫자를 반드시 모두 포함해야 합니다 (8자 이상)."
    if not u.isalnum():
        return False, "아이디는 영문과 숫자만 사용 가능합니다."
    return True, ""

def validate_password_format(password):
    """비밀번호 유효성 검사: 영문, 숫자, 특수기호 모두 포함하여 8자 이상"""
    if not password:
        return False, "비밀번호를 입력해 주세요."
    if len(password) < 8:
        return False, "비밀번호는 영문, 숫자, 특수기호를 모두 포함하여 8자 이상 입력해 주세요."
    has_letter = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = bool(re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?`~]', password))
    if not (has_letter and has_digit and has_special):
        return False, "비밀번호는 영문, 숫자, 특수기호를 반드시 모두 포함해야 합니다 (8자 이상)."
    return True, ""

def check_username_exists(username):
    """아이디 중복 여부 확인"""
    if not username:
        return True
    u = username.strip()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", (u,))
    row = cursor.fetchone()
    conn.close()
    return bool(row)

def check_nickname_exists(nickname):
    """닉네임 중복 여부 확인"""
    if not nickname:
        return True
    n = nickname.strip()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE LOWER(nickname) = LOWER(?)", (n,))
    row = cursor.fetchone()
    conn.close()
    return bool(row)

def register_user(username, password, email=None, marketing_agreed=False, nickname=None, team=None, favorite_team=None):
    conn = get_db()
    cursor = conn.cursor()

    username = username.strip() if username else ''
    valid_u, msg_u = validate_username_format(username)
    if not valid_u:
        conn.close()
        return {"status": "error", "message": msg_u}

    valid_p, msg_p = validate_password_format(password)
    if not valid_p:
        conn.close()
        return {"status": "error", "message": msg_p}

    # 아이디 중복 확인
    cursor.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", (username,))
    if cursor.fetchone():
        conn.close()
        return {"status": "error", "message": "이미 사용 중인 아이디입니다."}

    # 닉네임 유효성 (2~10자 범위) 및 중복 확인
    raw_nick = (nickname or username).strip()
    if len(raw_nick) < 2 or len(raw_nick) > 10:
        conn.close()
        return {"status": "error", "message": "감독 닉네임은 2자 이상 10자 이하로 입력해 주세요."}

    cursor.execute("SELECT id FROM users WHERE LOWER(nickname) = LOWER(?)", (raw_nick,))
    if cursor.fetchone():
        conn.close()
        return {"status": "error", "message": "이미 사용 중인 닉네임입니다."}

    fav_team = normalize_team_name(favorite_team or team)
    if not fav_team:
        conn.close()
        return {"status": "error", "message": "응원 구단을 선택해 주세요."}
    email = (email or '').strip()

    try:
        user_id = _insert_returning_id(cursor, '''
            INSERT INTO users (username, password, email, nickname, team, favorite_team, avatar, score, grade, marketing_agreed)
            VALUES (?, ?, ?, ?, ?, ?, '👑', 2000, 'B', ?)
        ''', (username, hash_password(password), email, raw_nick, fav_team, fav_team, 1 if marketing_agreed else 0))
        conn.commit()

        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = _public_user(cursor.fetchone()) or {}
        try:
            conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
        except Exception:
            pass
        conn.close()
        return {"status": "success", "user": user}
    except IntegrityError:
        conn.close()
        return {"status": "error", "message": "이미 사용 중인 아이디 또는 닉네임입니다."}
    except Exception as e:
        conn.close()
        return {"status": "error", "message": str(e)}

def login_user(username, password):
    u = username.strip() if username else ''
    p = password.strip() if password else ''
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (u,))
    row = cursor.fetchone()
    stored = row['password'] if row else ''
    if _is_password_hash(stored):
        ok = check_password_hash(stored, p)
    else:
        # 평문으로 남아 있던 비밀번호는 로그인 성공 시 해시로 교체
        ok = bool(row) and stored == p
        if ok:
            cursor.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(p), row['id']))
            conn.commit()
    conn.close()
    if ok:
        return {"status": "success", "user": _public_user(row)}
    # reason은 로그인 기록용 (사용자에게는 같은 안내 문구만 보여줌)
    return {"status": "error", "message": "아이디 또는 비밀번호가 일치하지 않습니다.",
            "reason": "wrong_password" if row else "no_user", "user_id": row['id'] if row else None}

def get_user_by_id(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return _public_user(row)

def verify_session_user(user_id, username):
    """세션에 담긴 유저 ID 및 username이 실제 DB users 테이블에 유효하게 존재하는지 검증"""
    if not user_id or not username:
        return None
    try:
        u_id = int(user_id)
    except (ValueError, TypeError):
        return None

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ? AND LOWER(username) = LOWER(?)", (u_id, str(username).strip()))
    row = cursor.fetchone()
    conn.close()
    return _public_user(row)

LOGIN_REASON_LABELS = {
    'ok': '로그인 성공',
    'wrong_password': '비밀번호 틀림',
    'no_user': '없는 아이디',
}

def log_login(username, success, reason='', user_id=None, ip=''):
    """로그인 시도 1건 기록 (기록 실패가 로그인 자체를 막지 않도록 예외는 무시)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO login_logs (user_id, username, success, reason, ip) VALUES (?, ?, ?, ?, ?)",
            (user_id, (username or '').strip()[:50], 1 if success else 0, reason, (ip or '')[:64])
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"⚠️ [DB] 로그인 기록 저장 실패: {e}")

def get_recent_login_logs(limit=50):
    """최근 로그인 기록 (관리자 전용, 한국 시간)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT l.id, l.username, l.success, l.reason, l.ip, l.created_at, u.nickname
        FROM login_logs l
        LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.id DESC
        LIMIT ?
    ''', (limit,))
    logs = []
    for r in cursor.fetchall():
        item = dict(r)
        item['created_at'] = _to_kst_str(item['created_at'])
        item['reason_label'] = LOGIN_REASON_LABELS.get(item['reason'], item['reason'] or '-')
        logs.append(item)
    conn.close()
    return logs

def update_user_profile(user_id, nickname, team):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET nickname = ?, team = ?, favorite_team = ? WHERE id = ?", (nickname, team, team, user_id))
    conn.commit()
    conn.close()

def update_user_score(new_score, new_grade, user_id=1):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE users
        SET score = ?, grade = ?
        WHERE id = ?
    ''', (new_score, new_grade, user_id))
    
    # 하위 호환성 user_rankings도 업데이트
    cursor.execute('''
        UPDATE user_rankings
        SET score = ?, grade = ?
        WHERE is_me = 1
    ''', (new_score, new_grade))
    conn.commit()
    conn.close()

def search_users_by_nickname(query, current_user_id=1):
    conn = get_db()
    cursor = conn.cursor()
    search_term = f"%{query}%"
    
    # 해당 유저의 기존 친구 ID 목록 가져오기
    cursor.execute("SELECT friend_id FROM user_friends WHERE user_id = ?", (current_user_id,))
    friend_ids = {row['friend_id'] for row in cursor.fetchall()}

    cursor.execute('''
        SELECT id, nickname, team, avatar, score, grade
        FROM users
        WHERE LOWER(nickname) LIKE LOWER(?) AND id != ?
        ORDER BY score DESC
        LIMIT 20
    ''', (search_term, current_user_id))
    
    rows = cursor.fetchall()
    results = []
    for r in rows:
        item = dict(r)
        item['is_friend'] = item['id'] in friend_ids
        results.append(item)

    conn.close()
    return results

def add_friend(user_id, friend_id):
    if user_id == friend_id:
        return {"status": "error", "message": "자기 자신은 친구로 추가할 수 없습니다."}
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO user_friends (user_id, friend_id) VALUES (?, ?)", (user_id, friend_id))
        conn.commit()
        conn.close()
        return {"status": "success", "message": "친구로 등록되었습니다."}
    except IntegrityError:
        conn.close()
        return {"status": "error", "message": "이미 등록된 친구입니다."}

def get_user_friends_ranking(user_id=1):
    conn = get_db()
    cursor = conn.cursor()

    # 본인 정보
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    me_row = cursor.fetchone()
    
    if not me_row:
        # fallback to master user or default
        cursor.execute("SELECT * FROM users ORDER BY id ASC LIMIT 1")
        me_row = cursor.fetchone()

    me = _public_user(me_row)
    me['is_me'] = True
    me['name'] = f"{me['nickname']} (나)"
    me['team'] = me.get('favorite_team') or me.get('team')
    me['favorite_team'] = me['team']

    # 친구들의 정보
    cursor.execute('''
        SELECT u.id, u.nickname as name, COALESCE(u.favorite_team, u.team) as team, COALESCE(u.favorite_team, u.team) as favorite_team, u.avatar, u.score, u.grade
        FROM user_friends f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ?
    ''', (me['id'],))
    
    friends = [dict(r) for r in cursor.fetchall()]
    for f in friends:
        f['is_me'] = False

    all_users = [me] + friends
    all_users.sort(key=lambda x: x['score'], reverse=True)
    
    conn.close()
    return all_users

def get_friend_rankings():
    return get_user_friends_ranking(1)

def log_tactic(inning, situation, tactic_chosen, score_change, result_grade, commentary):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO tactics_history (inning, situation, tactic_chosen, score_change, result_grade, commentary)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (inning, situation, tactic_chosen, score_change, result_grade, commentary))
    conn.commit()
    conn.close()

def get_tactics_history():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tactics_history ORDER BY id DESC LIMIT 10")
    rows = [dict(r) for r in cursor.fetchall()]
    for r in rows:
        if r.get('timestamp'):
            r['timestamp'] = _to_kst_str(r['timestamp'])
    conn.close()
    return rows

def seed_kbo_schedules():
    conn = get_db()
    cursor = conn.cursor()
    
    # 기존 일정 테이블 초기화 후 완벽 재시딩
    cursor.execute("DELETE FROM kbo_schedules")

    raw_schedules = [
        # 9월 22일 (화) - 18:30 (화요일 룰)
        ("2026-09-22", "화", "18:30", "삼성", "NC", "대구", 0),
        ("2026-09-22", "화", "18:30", "SSG", "KT", "문학", 0),
        ("2026-09-22", "화", "18:30", "한화", "롯데", "대전", 0),
        ("2026-09-22", "화", "18:30", "키움", "두산", "고척", 0),
        
        # 9월 23일 (수) - 18:30 (수요일 룰)
        ("2026-09-23", "수", "18:30", "두산", "KIA", "잠실", 0),
        ("2026-09-23", "수", "18:30", "KT", "NC", "수원", 0),
        ("2026-09-23", "수", "18:30", "한화", "롯데", "대전", 0),

        # 9월 24일 (목) - 18:30 (목요일 룰)
        ("2026-09-24", "목", "18:30", "LG", "롯데", "잠실", 0),
        ("2026-09-24", "목", "18:30", "SSG", "삼성", "문학", 0),
        ("2026-09-24", "목", "18:30", "KT", "NC", "수원", 0),

        # 9월 25일 (금) - 18:30 (금요일 룰)
        ("2026-09-25", "금", "18:30", "두산", "롯데", "잠실", 0),
        ("2026-09-25", "금", "18:30", "SSG", "삼성", "문학", 0),
        ("2026-09-25", "금", "18:30", "NC", "한화", "창원", 0),

        # 9월 26일 (토) - 17:00 (토요일 룰)
        ("2026-09-26", "토", "17:00", "KIA", "LG", "광주", 0),
        ("2026-09-26", "토", "17:00", "KT", "키움", "수원", 0),
        ("2026-09-26", "토", "17:00", "NC", "한화", "창원", 0),

        # 9월 27일 (일) - 14:00 (일요일 룰)
        ("2026-09-27", "일", "14:00", "두산", "KT", "잠실", 0),
        ("2026-09-27", "일", "14:00", "롯데", "한화", "사직", 0),
        ("2026-09-27", "일", "14:00", "KIA", "LG", "광주", 0),
        ("2026-09-27", "일", "14:00", "NC", "키움", "창원", 0),

        # 9월 28일 (월) - 월요일 KBO 정기 휴식일
        ("2026-09-28", "월", "휴식일", "전구단", "휴식", "-", 1),

        # 9월 29일 (화) - 18:30 (화요일 룰)
        ("2026-09-29", "화", "18:30", "두산", "NC", "잠실", 0),
        ("2026-09-29", "화", "18:30", "삼성", "한화", "대구", 0),
        ("2026-09-29", "화", "18:30", "롯데", "키움", "사직", 0),
        ("2026-09-29", "화", "18:30", "SSG", "LG", "문학", 0),
        ("2026-09-29", "화", "18:30", "KIA", "KT", "광주", 0),

        # 9월 30일 (수) - 18:30 (수요일 룰)
        ("2026-09-30", "수", "18:30", "두산", "NC", "잠실", 0),
        ("2026-09-30", "수", "18:30", "삼성", "한화", "대구", 0),
        ("2026-09-30", "수", "18:30", "롯데", "키움", "사직", 0),
        ("2026-09-30", "수", "18:30", "SSG", "LG", "문학", 0),
        ("2026-09-30", "수", "18:30", "KIA", "KT", "광주", 0),

        # 10월 1일 (목) - 18:30 (목요일 룰)
        ("2026-10-01", "목", "18:30", "두산", "NC", "잠실", 0),
        ("2026-10-01", "목", "18:30", "삼성", "한화", "대구", 0),
        ("2026-10-01", "목", "18:30", "SSG", "LG", "문학", 0),
        ("2026-10-01", "목", "18:30", "KIA", "KT", "광주", 0),

        # 10월 2일 (금) - 예비일 편성 구간 (경기 없음)
        ("2026-10-02", "금", "휴식일", "전구단", "예비일 편성 구간", "-", 1),

        # 10월 3일 (토) - 17:00 (토요일 룰)
        ("2026-10-03", "토", "17:00", "LG", "KIA", "잠실", 0),
        ("2026-10-03", "토", "17:00", "삼성", "두산", "대구", 0),
        ("2026-10-03", "토", "17:00", "KT", "롯데", "수원", 0),
        ("2026-10-03", "토", "17:00", "NC", "SSG", "창원", 0),
        ("2026-10-03", "토", "17:00", "한화", "키움", "대전", 0),

        # 10월 4일 (일) - 14:00 (일요일 룰)
        ("2026-10-04", "일", "14:00", "LG", "KIA", "잠실", 0),
        ("2026-10-04", "일", "14:00", "삼성", "두산", "대구", 0),
        ("2026-10-04", "일", "14:00", "NC", "SSG", "창원", 0),
        ("2026-10-04", "일", "14:00", "한화", "키움", "대전", 0),
        ("2026-10-04", "일", "14:00", "KT", "롯데", "수원", 0),

        # 10월 5일 (월) - 월요일 KBO 정기 휴식일
        ("2026-10-05", "월", "휴식일", "전구단", "휴식", "-", 1),

        # 10월 6일 (화) - 18:30 (화요일 룰 - 이미지 공식 일정)
        ("2026-10-06", "화", "18:30", "LG", "NC", "잠실", 0),
        ("2026-10-06", "화", "18:30", "롯데", "두산", "사직", 0),
        ("2026-10-06", "화", "18:30", "KIA", "삼성", "광주", 0),
        ("2026-10-06", "화", "18:30", "한화", "SSG", "대전", 0),
        ("2026-10-06", "화", "18:30", "키움", "KT", "고척", 0),

        # 10월 7일 (수) - 18:30 (수요일 룰 - 이미지 공식 일정)
        ("2026-10-07", "수", "18:30", "LG", "두산", "잠실", 0),
        ("2026-10-07", "수", "18:30", "롯데", "KIA", "사직", 0),
        ("2026-10-07", "수", "18:30", "SSG", "NC", "문학", 0),
        ("2026-10-07", "수", "18:30", "KT", "삼성", "수원", 0),
        ("2026-10-07", "수", "18:30", "키움", "한화", "고척", 0),

        # 10월 8일 (목) - 예비일/휴식일
        ("2026-10-08", "목", "휴식일", "전구단", "예비일", "-", 1),

        # 10월 9일 (금) - 14:00 (공휴일 룰 - 이미지 공식 일정)
        ("2026-10-09", "금", "14:00", "롯데", "LG", "사직", 0),
        ("2026-10-09", "금", "14:00", "SSG", "삼성", "문학", 0),
        ("2026-10-09", "금", "14:00", "NC", "KIA", "창원", 0),

        # 10월 10일 (토) - 14:00 / 17:00 (토요일 룰 - 이미지 공식 일정)
        ("2026-10-10", "토", "14:00", "롯데", "LG", "사직", 0),
        ("2026-10-10", "토", "17:00", "KIA", "SSG", "광주", 0),
        ("2026-10-10", "토", "17:00", "한화", "NC", "대전", 0),

        # 10월 11일 (일) - 14:00 (일요일 룰 - 이미지 공식 일정)
        ("2026-10-11", "일", "14:00", "삼성", "KT", "대구", 0),
        ("2026-10-11", "일", "14:00", "KIA", "롯데", "광주", 0),

        # 10월 12일 (월) - 18:30 (이미지 공식 일정)
        ("2026-10-12", "월", "18:30", "두산", "롯데", "잠실", 0),
        ("2026-10-12", "월", "18:30", "삼성", "KT", "대구", 0),
        ("2026-10-12", "월", "18:30", "KIA", "LG", "광주", 0)
    ]

    DAILY_PITCHERS = {
        "2026-10-06": {
            "NC": "최성영", "LG": "박시원",
            "두산": "곽빈", "롯데": "박세웅",
            "삼성": "장찬희", "KIA": "김태형",
            "SSG": "김건우", "한화": "화이트",
            "KT": "대니엘", "키움": "박준현"
        },
        "2026-09-30": {
            "한화": "화이트", "삼성": "후라도",
            "KT": "대니엘", "KIA": "김태형",
            "LG": "박시원", "SSG": "김건우",
            "NC": "라일리", "두산": "잭로그",
            "키움": "김성진", "롯데": "로드리게스"
        },
        "2026-09-29": {
            "한화": "류현진", "삼성": "원태인",
            "NC": "이재학", "두산": "곽빈",
            "키움": "하영민", "롯데": "박세웅",
            "LG": "임찬규", "SSG": "김광현",
            "KT": "고영표", "KIA": "올러"
        },
        "2026-09-27": {
            "두산": "최원준", "KT": "고영표",
            "롯데": "반즈", "한화": "문동주",
            "KIA": "양현종", "LG": "임찬규",
            "NC": "신민혁", "키움": "조영건"
        },
        "2026-09-26": {
            "KIA": "윤영철", "LG": "최원태",
            "KT": "엄상백", "키움": "김인범",
            "NC": "김시훈", "한화": "폰세"
        },
        "2026-09-25": {
            "두산": "발라조빅", "롯데": "김진욱",
            "SSG": "엘리아스", "삼성": "레예스",
            "NC": "하트", "한화": "박준영"
        }
    }

    rows = []
    for date, dow, stime, home, away, stadium, is_rest in raw_schedules:
        if is_rest == 1:
            hp = ""
            ap = ""
            st = "휴식일"
        else:
            st = "경기전"
            hp = DAILY_PITCHERS.get(date, {}).get(home, "")
            ap = DAILY_PITCHERS.get(date, {}).get(away, "")
        rows.append((date, dow, stime, home, away, stadium, hp, ap, st, is_rest))

    cursor.executemany('''
        INSERT INTO kbo_schedules (game_date, day_of_week, start_time, home_team, away_team, stadium, home_pitcher, away_pitcher, status_text, is_rest_day)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', rows)

    conn.commit()
    conn.close()

def get_all_schedules():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM kbo_schedules ORDER BY game_date ASC, id ASC")
    rows = [dict(r) for r in cursor.fetchall() if r['is_rest_day'] == 1 or r['home_team'] != r['away_team']]
    conn.close()
    return rows

def get_schedules_by_date(date_str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM kbo_schedules WHERE game_date = ? ORDER BY id ASC", (date_str,))
    rows = [dict(r) for r in cursor.fetchall() if r['is_rest_day'] == 1 or r['home_team'] != r['away_team']]
    conn.close()
    return rows

def normalize_team_name(name):
    """KBO 10개 구단 단축명 또는 정식 명칭을 단축명으로 변환. 유효한 구단이 아니면 None"""
    if not name:
        return None
    name = str(name).strip()
    kbo_teams = {
        '삼성': '삼성 라이온즈', '한화': '한화 이글스', 'KIA': 'KIA 타이거즈', 'LG': 'LG 트윈스', '두산': '두산 베어스',
        '롯데': '롯데 자이언츠', 'SSG': 'SSG 랜더스', 'KT': 'KT 위즈', 'NC': 'NC 다이노스', '키움': '키움 히어로즈'
    }
    for short, full in kbo_teams.items():
        if name in (short, full):
            return short
    return None

def _days_apart(a, b):
    return abs((datetime.date.fromisoformat(a) - datetime.date.fromisoformat(b)).days)

def get_today_schedule_info(date_str=None, team_name=None):
    """응원 구단 기준 로비 경기 정보. 오늘 경기가 없으면 해당 구단의 가장 가까운 경기를 반환하고,
    is_today로 그 경기가 오늘 경기인지 알려준다. 다른 구단 경기로 대체하지 않는다."""
    if not date_str:
        date_str = datetime.date.today().strftime('%Y-%m-%d')
    requested_date = date_str
    norm_team = normalize_team_name(team_name)
    if not norm_team:
        return {"game_date": date_str, "is_today": True, "is_rest_day": False, "start_time": None, "match": None, "all_matches": []}
    schedules = get_schedules_by_date(date_str)
    if not schedules:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT game_date FROM kbo_schedules")
        all_dates = [r['game_date'] for r in cursor.fetchall() if r['game_date']]
        conn.close()
        if all_dates:
            date_str = min(all_dates, key=lambda d: (_days_apart(d, requested_date), d))
            schedules = get_schedules_by_date(date_str)
    
    is_rest = any(s['is_rest_day'] == 1 for s in schedules) if schedules else False
    if is_rest:
        return {
            "game_date": date_str,
            "is_today": date_str == requested_date,
            "is_rest_day": True,
            "start_time": "휴식일",
            "match": None,
            "all_matches": schedules or []
        }

    # 유저 팀이 포함된 경기 검색
    selected_match = None
    if schedules:
        for s in schedules:
            if normalize_team_name(s['home_team']) == norm_team or normalize_team_name(s['away_team']) == norm_team:
                selected_match = s
                break

    # 해당 날짜에 유저 팀 경기가 없다면, 해당 팀의 다음 경기(없으면 가장 최근 경기) 검색
    if not selected_match:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM kbo_schedules 
            WHERE (home_team = ? OR away_team = ?) AND is_rest_day = 0
            ORDER BY game_date ASC, id ASC
        """, (norm_team, norm_team))
        team_games = [dict(r) for r in cursor.fetchall()]
        conn.close()
        upcoming = [g for g in team_games if g['game_date'] >= requested_date]
        row = upcoming[0] if upcoming else (team_games[-1] if team_games else None)
        if row:
            selected_match = row
            date_str = selected_match['game_date']
            schedules = get_schedules_by_date(date_str)

    # 응원 구단 경기가 DB에 하나도 없으면 다른 구단 경기로 대체하지 않고 '일정 없음'으로 반환
    if not selected_match:
        return {
            "game_date": requested_date,
            "is_today": True,
            "is_rest_day": False,
            "start_time": None,
            "match": None,
            "all_matches": []
        }

    return {
        "game_date": date_str,
        "is_today": date_str == requested_date,
        "is_rest_day": False,
        "start_time": selected_match['start_time'],
        "match": selected_match,
        "all_matches": schedules
    }

def get_all_users():
    """모든 회원 목록 조회 (관리자 전용)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, username, email, nickname, team, favorite_team, avatar, score, grade, marketing_agreed, created_at
        FROM users
        ORDER BY id DESC
    ''')
    rows = cursor.fetchall()
    users = []
    for r in rows:
        users.append(_public_user(r))
    conn.close()
    return users

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully.")

