import sqlite3
import json
import os
import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'baseball.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 회원가입 유저 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT NOT NULL,
            nickname TEXT NOT NULL,
            team TEXT NOT NULL DEFAULT '롯데',
            avatar TEXT NOT NULL DEFAULT '👑',
            score INTEGER NOT NULL DEFAULT 2000,
            grade TEXT NOT NULL DEFAULT 'B',
            marketing_agreed INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 친구 관계 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, friend_id)
        )
    ''')

    # 기존 유저 랭킹 테이블 (하위 호환성 유지)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_rankings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            team TEXT NOT NULL,
            avatar TEXT NOT NULL,
            score INTEGER NOT NULL,
            grade TEXT NOT NULL,
            is_me BOOLEAN NOT NULL DEFAULT 0
        )
    ''')

    # 감독 작전 로그
    cursor.execute('''
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
    ''')

    # 2026 KBO 9~10월 공식 일정 테이블
    cursor.execute('''
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
    ''')

    cursor.execute("PRAGMA table_info(kbo_schedules)")
    cols = [col[1] for col in cursor.fetchall()]
    if "home_pitcher" not in cols:
        cursor.execute("ALTER TABLE kbo_schedules ADD COLUMN home_pitcher TEXT DEFAULT ''")
    if "away_pitcher" not in cols:
        cursor.execute("ALTER TABLE kbo_schedules ADD COLUMN away_pitcher TEXT DEFAULT ''")
    if "status_text" not in cols:
        cursor.execute("ALTER TABLE kbo_schedules ADD COLUMN status_text TEXT DEFAULT '경기전'")

    conn.commit()
    conn.close()

    # 테스트 및 검색용 초기 가상 유저 데이터 시딩
    seed_mock_users()
    seed_kbo_schedules()

def seed_mock_users():
    conn = get_db()
    cursor = conn.cursor()
    
    mock_users = [
        ("master", "pass123", "master@zipgamdok.com", "김명장", "롯데", "👑", 2000, "B", 1),
        ("haeseol", "pass123", "haeseol@zipgamdok.com", "이해설", "LG", "🧢", 1950, "B", 1),
        ("yagoo", "pass123", "yagoo@zipgamdok.com", "박야구", "KIA", "⚾", 1900, "C", 1),
        ("jigwan", "pass123", "jigwan@zipgamdok.com", "최직관", "SSG", "🍿", 1820, "C", 1),
        ("bunseok", "pass123", "bunseok@zipgamdok.com", "정분석", "삼성", "📊", 1750, "F", 0),
        ("fanner", "pass123", "fanner@zipgamdok.com", "강패너", "롯데", "🎺", 1680, "F", 1),
        ("chobo", "pass123", "chobo@zipgamdok.com", "윤초보", "두산", "🐥", 1550, "F", 0)
    ]

    for username, password, email, nickname, team, avatar, score, grade, mkt in mock_users:
        try:
            cursor.execute('''
                INSERT INTO users (username, password, email, nickname, team, avatar, score, grade, marketing_agreed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (username, password, email, nickname, team, avatar, score, grade, mkt))
        except sqlite3.IntegrityError:
            pass  # 이미 존재하면 패스

    # 기본 master 유저(id=1)에게 이해설(2), 박야구(3), 최직관(4)을 친구로 기본 연동
    cursor.execute("SELECT id FROM users WHERE username = 'master'")
    master = cursor.fetchone()
    if master:
        master_id = master['id']
        for f_username in ['haeseol', 'yagoo', 'jigwan', 'bunseok']:
            cursor.execute("SELECT id FROM users WHERE username = ?", (f_username,))
            f_row = cursor.fetchone()
            if f_row:
                try:
                    cursor.execute("INSERT INTO user_friends (user_id, friend_id) VALUES (?, ?)", (master_id, f_row['id']))
                except sqlite3.IntegrityError:
                    pass

    conn.commit()
    conn.close()

def register_user(username, password, email=None, marketing_agreed=False, nickname=None, team='한화'):
    conn = get_db()
    cursor = conn.cursor()

    if not email:
        email = f"{username}@zipgamdok.com"
    if not nickname:
        nickname = username
    if not team:
        team = '한화'

    try:
        cursor.execute('''
            INSERT INTO users (username, password, email, nickname, team, avatar, score, grade, marketing_agreed)
            VALUES (?, ?, ?, ?, ?, '👑', 2000, 'B', ?)
        ''', (username, password, email, nickname, team, 1 if marketing_agreed else 0))
        conn.commit()
        user_id = cursor.lastrowid

        # 기본 친구 몇 명 자동 등록 (소셜 랭킹 풍성함을 위해)
        cursor.execute("SELECT id FROM users WHERE username IN ('haeseol', 'yagoo')")
        for row in cursor.fetchall():
            try:
                cursor.execute("INSERT INTO user_friends (user_id, friend_id) VALUES (?, ?)", (user_id, row['id']))
            except sqlite3.IntegrityError:
                pass
        conn.commit()

        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = dict(cursor.fetchone())
        conn.close()
        return {"status": "success", "user": user}
    except sqlite3.IntegrityError:
        conn.close()
        return {"status": "error", "message": "이미 사용 중인 아이디입니다."}
    except Exception as e:
        conn.close()
        return {"status": "error", "message": str(e)}

def login_user(username, password):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, password))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"status": "success", "user": dict(row)}
    else:
        return {"status": "error", "message": "아이디 또는 비밀번호가 일치하지 않습니다."}

def get_user_by_id(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_user_profile(user_id, nickname, team):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET nickname = ?, team = ? WHERE id = ?", (nickname, team, user_id))
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
        WHERE nickname LIKE ? AND id != ?
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
    except sqlite3.IntegrityError:
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

    me = dict(me_row)
    me['is_me'] = True
    me['name'] = f"{me['nickname']} (나)"

    # 친구들의 정보
    cursor.execute('''
        SELECT u.id, u.nickname as name, u.team, u.avatar, u.score, u.grade
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

    for date, dow, stime, home, away, stadium, is_rest in raw_schedules:
        if is_rest == 1:
            hp = ""
            ap = ""
            st = "휴식일"
        else:
            st = "경기전"
            hp = DAILY_PITCHERS.get(date, {}).get(home, "")
            ap = DAILY_PITCHERS.get(date, {}).get(away, "")

        cursor.execute('''
            INSERT INTO kbo_schedules (game_date, day_of_week, start_time, home_team, away_team, stadium, home_pitcher, away_pitcher, status_text, is_rest_day)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (date, dow, stime, home, away, stadium, hp, ap, st, is_rest))

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

def get_today_schedule_info(date_str=None, team_name="롯데"):
    if not date_str:
        date_str = datetime.date.today().strftime('%Y-%m-%d')
    schedules = get_schedules_by_date(date_str)
    if not schedules:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT game_date FROM kbo_schedules ORDER BY ABS(JULIANDAY(game_date) - JULIANDAY(?)) LIMIT 1", (date_str,))
        row = cursor.fetchone()
        conn.close()
        if row and row['game_date']:
            date_str = row['game_date']
            schedules = get_schedules_by_date(date_str)
    if not schedules:
        fallback_away = "LG" if team_name != "LG" else "한화"
        return {
            "game_date": date_str,
            "is_rest_day": False,
            "start_time": "18:30",
            "match": {"home_team": team_name, "away_team": fallback_away, "stadium": "대전"},
            "all_matches": []
        }
    
    is_rest = any(s['is_rest_day'] == 1 for s in schedules)
    if is_rest:
        return {
            "game_date": date_str,
            "is_rest_day": True,
            "start_time": "휴식일",
            "match": None,
            "all_matches": schedules
        }

    # 유저 팀이 포함된 경기 검색
    selected_match = None
    for s in schedules:
        if s['home_team'] == team_name or s['away_team'] == team_name:
            selected_match = s
            break
    
    if not selected_match and schedules:
        selected_match = schedules[0]

    return {
        "game_date": date_str,
        "is_rest_day": False,
        "start_time": selected_match['start_time'] if selected_match else "18:30",
        "match": selected_match,
        "all_matches": schedules
    }

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully.")
