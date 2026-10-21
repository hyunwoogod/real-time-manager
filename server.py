from markupsafe import Markup
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, Response, make_response, send_from_directory, g
from functools import wraps
from werkzeug.middleware.proxy_fix import ProxyFix
import os
import sys
import json
import time
import datetime
import secrets
import database
import social_auth
import game_engine
from game_engine import GameEngine

# gunicorn에서도 print 로그가 Render Logs에 즉시 보이도록 줄 단위로 출력
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

app = Flask(__name__, static_folder='static', static_url_path='', template_folder='templates')
# Render 프록시 뒤에서 https 주소/실제 접속 IP를 올바르게 인식 (소셜 로그인 redirect_uri에 필요)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.secret_key = os.environ.get('SECRET_KEY', 'zipgamdok-secret-baseball-key-2026')
app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(days=7)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True

ADMIN_SECRET_CODE = os.environ.get('ADMIN_SECRET_CODE', 'zipgamdok2026!')
ADMIN_VALID_CODES = {ADMIN_SECRET_CODE, 'zipgamdok2026!', 'admin1234'}

PORT = int(os.environ.get('PORT', 8000))

# KBO 10개 구단 메타데이터 및 도우미 함수
TEAM_FULL_NAMES = {
    '삼성': '삼성 라이온즈',
    '한화': '한화 이글스',
    'KIA': 'KIA 타이거즈',
    'LG': 'LG 트윈스',
    '두산': '두산 베어스',
    '롯데': '롯데 자이언츠',
    'SSG': 'SSG 랜더스',
    'KT': 'KT 위즈',
    'NC': 'NC 다이노스',
    '키움': '키움 히어로즈'
}

TEAM_LOGOS = {
    '삼성': '🦁',
    '한화': '🦅',
    'KIA': '🐯',
    'LG': '🧢',
    '두산': '🐻',
    '롯데': '⚓',
    'SSG': '🚀',
    'KT': '🧙',
    'NC': '🦖',
    '키움': '🦸'
}

# 실제 구단 로고 이미지 (정식 출시 전 라이선스 필요). 없는 팀은 위 이모지로 대신 표시
TEAM_LOGO_FILES = {
    '삼성': 'samsung', '한화': 'hanwha', 'KIA': 'kia', 'LG': 'lg', '두산': 'doosan',
    '롯데': 'lotte', 'SSG': 'ssg', 'KT': 'kt', 'NC': 'nc', '키움': 'kiwoom'
}
TEAM_LOGO_VERSION = '6'


def team_logo_html(team):
    """구단 로고 이미지 태그 (이미지가 없으면 빈 문자열)"""
    name = TEAM_LOGO_FILES.get(team)
    if not name:
        return ''
    return Markup(f'<img class="team-logo-img" src="/logos/v2/{name}.png?v={TEAM_LOGO_VERSION}" alt="{team}">')

TEAM_COLORS = {
    '삼성': '#005CB9',
    '한화': '#FF6600',
    'KIA': '#EA0029',
    'LG': '#C30452',
    '두산': '#131230',
    '롯데': '#041E42',
    'SSG': '#CE0E2D',
    'KT': '#000000',
    'NC': '#315288',
    '키움': '#570514'
}

def normalize_team_short(name):
    """'한화 이글스', '한화' 등을 KBO 10개 구단 단축명으로 변환. 유효한 구단이 아니면 None"""
    if not name:
        return None
    name = str(name).strip()
    for short, full in TEAM_FULL_NAMES.items():
        if name in (short, full):
            return short
    return None


def client_ip():
    """Render 등 프록시 뒤에서도 실제 접속 IP를 얻기 위해 X-Forwarded-For 첫 값 사용"""
    forwarded = request.headers.get('X-Forwarded-For', '')
    return forwarded.split(',')[0].strip() if forwarded else (request.remote_addr or '')


def team_full_name(team):
    return TEAM_FULL_NAMES.get(team, '응원 구단 미설정')


def resolve_user_team(user):
    """DB 사용자 레코드에서 응원 구단을 단축명('한화', 'KIA' 등)으로 정규화해 반환"""
    if not user:
        return normalize_team_short(None)
    return normalize_team_short(user.get('favorite_team') or user.get('team'))


def sync_session_from_user(user):
    """DB 사용자 레코드 기준으로 세션의 사용자 정보를 갱신하는 유일한 진입점"""
    username = user.get('username') or ''
    session['user_id'] = user.get('id')
    session['username'] = username
    session['nickname'] = user.get('nickname') or (username + " 감독")
    session['favorite_team'] = resolve_user_team(user)
    session['account_label'] = database.account_label(user)

# DB 초기화
database.init_db()

# 게임 기록 1회 초기화 (2026-10-12 요청: 모두 테스트 1일차·감독 점수 2000점부터). 한 번 실행되면 다시 안 함
PLAY_RESET_VERSION = "2026-10-12"
if database.get_setting("play_reset_version", "") != PLAY_RESET_VERSION:
    database.reset_play_data()
    database.set_setting("play_reset_version", PLAY_RESET_VERSION)
    print(f"⚾ [초기화] 게임 기록을 초기화했어요 ({PLAY_RESET_VERSION})")

# 사용자별 게임 엔진 (예전엔 서버 전체가 경기 하나를 같이 써서,
# 다른 사람이 경기에 들어가면 모두의 화면이 그 팀으로 바뀌는 문제가 있었음)
import threading
from collections import OrderedDict
_engines = OrderedDict()
_engines_lock = threading.Lock()
MAX_ENGINES = 500  # 오래 안 쓴 경기부터 정리 (메모리 보호)


import pickle
import base64
_snapshot_at = {}


def save_engine_snapshot(eng, force=False):
    """진행 중인 경기를 DB에 저장 (새로고침·재접속·서버 재시작 뒤에도 그 시점부터 이어서). 5초에 한 번 정도만"""
    uid = getattr(eng, 'user_id', None)
    if not uid:
        return
    now = time.time()
    if not force and now - _snapshot_at.get(uid, 0) < 5:
        return
    _snapshot_at[uid] = now
    try:
        database.set_setting(f"engine:{uid}", base64.b64encode(pickle.dumps(eng)).decode('ascii'))
    except Exception as e:
        print(f"[engine snapshot] 저장 실패: {e}")


def load_engine_snapshot(uid):
    """저장된 경기 불러오기 (오늘 일차의 경기만)"""
    raw = database.get_setting(f"engine:{uid}", "")
    if not raw:
        return None
    try:
        eng = pickle.loads(base64.b64decode(raw))
    except Exception:
        return None
    if TEST_SEASON and getattr(eng, 'test_day', None) != test_day():
        return None
    return eng


def verify_user_cached(user_id, username):
    """로그인 사용자 확인: 한 요청 안에서는 한 번만 DB에 물음 (가드와 데코레이터가 같은 확인을 반복하지 않게)"""
    key = (user_id, username)
    cache = g.setdefault('_verified_users', {})
    if key not in cache:
        cache[key] = database.verify_session_user(user_id, username)
    return cache[key]


def get_engine():
    """현재 로그인한 사용자의 게임 엔진 (메모리에 없으면 저장된 경기를 불러오고, 그것도 없으면 새로 만듦)"""
    uid = session.get('user_id')
    key = uid if uid else 'guest'
    with _engines_lock:
        eng = _engines.get(key)
        if eng is None and uid:
            eng = load_engine_snapshot(uid)
            if eng is not None:
                _engines[key] = eng
        if eng is None:
            eng = GameEngine("한화", "롯데", user_id=uid)
            _engines[key] = eng
            while len(_engines) > MAX_ENGINES:
                _engines.popitem(last=False)
        else:
            _engines.move_to_end(key)
        return eng


def login_required(f):
    """세션 및 SQLite 데이터베이스 실시간 대조 인증 데코레이터:
    세션에 user_id와 username이 존재하더라도, 실제 SQLite DB users 테이블에 유효하게 존재하는 사용자인지 엄격 검증.
    DB에 존재하지 않거나 무효한 세션인 경우 즉시 session.clear() 및 쿠키 만료 후 로그인 페이지로 강제 리다이렉트.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        username = session.get('username')

        # 1. 세션 키 존재 여부 확인
        if not user_id or not username:
            session.clear()
            session.modified = True
            if request.is_json or request.path.startswith('/api/'):
                resp = jsonify({
                    "status": "error",
                    "message": "로그인이 필요합니다.",
                    "redirect": url_for('login')
                })
                resp.status_code = 401
            else:
                resp = make_response(redirect(url_for('login')))
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
            return resp

        # 2. SQLite users 테이블에 실제 존재하는 유효 사용자인지 실시간 대조
        db_user = verify_user_cached(user_id, username)
        if not db_user:
            session.clear()
            session.modified = True
            if request.is_json or request.path.startswith('/api/'):
                resp = jsonify({
                    "status": "error",
                    "message": "유효하지 않은 계정 세션입니다. 다시 로그인해 주세요.",
                    "redirect": url_for('login')
                })
                resp.status_code = 401
            else:
                resp = make_response(redirect(url_for('login')))

            cookie_name = app.config.get('SESSION_COOKIE_NAME', 'session')
            resp.delete_cookie(
                cookie_name,
                path=app.config.get('APPLICATION_ROOT', '/'),
                domain=app.config.get('SESSION_COOKIE_DOMAIN', None),
                samesite=app.config.get('SESSION_COOKIE_SAMESITE', 'Lax')
            )
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
            return resp

        # 최신 DB 정보로 세션 상태 갱신
        sync_session_from_user(db_user)
        return f(*args, **kwargs)
    return decorated_function


@app.before_request
def strip_trailing_slash():
    """/privacy/ 처럼 끝에 / 가 붙은 주소도 /privacy 로 열리도록 이동"""
    path = request.path
    if len(path) > 1 and path.endswith('/'):
        query = request.query_string.decode('utf-8')
        return redirect(path.rstrip('/') + (f'?{query}' if query else ''), code=301)
    return None


@app.errorhandler(404)
def page_not_found(e):
    """없는 주소로 들어왔을 때 영문 기본 오류 대신 안내 화면 표시"""
    return render_template('not_found.html'), 404


@app.before_request
def authentication_guard():
    """모든 요청 사전 검사 가드: SQLite users 테이블 실시간 대조 및 무효 세션 즉각 강제 파기"""
    path = request.path

    # 1. 정적 에셋 파일 허용
    if (path.startswith('/static') or 
        path.startswith('/logos') or
        path == '/manifest.json' or
        path.endswith(('.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.map', '.webp'))):
        return None

    # 2. 공개 접근 허용 라우트 (로그인/회원가입/중복확인/관리자 인증/상태조회)
    PUBLIC_PATHS = {
        '/login', 
        '/signup', 
        '/logout',
        '/admin/users', 
        '/admin/games',
        '/admin/logout',
        '/api/login', 
        '/api/register',
        '/api/session',
        '/api/me',
        '/api/check-nickname',
        '/signup/social',
        '/forgot-password',
        '/find-email',
        '/privacy',
        '/terms',
        '/healthz'
    }
    if path in PUBLIC_PATHS or path.startswith('/api/check-') or path.startswith('/auth/'):
        return None

    # 3. 비인가 세션 검사
    user_id = session.get('user_id')
    username = session.get('username')

    if not user_id or not username:
        session.clear()
        session.modified = True
        if request.is_json or path.startswith('/api/'):
            resp = jsonify({
                "status": "error",
                "message": "로그인이 필요합니다.",
                "redirect": url_for('login')
            })
            resp.status_code = 401
        else:
            resp = make_response(redirect(url_for('login')))
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp

    # 4. DB users 테이블 대조 검증
    #    경기 중 자주 부르는 주소(투구·상태)는 30초간 확인 결과를 재사용해 DB 왕복을 줄임
    if path in GAME_API_PATHS:
        db_user = cached_verify_user(user_id, username)
    else:
        db_user = verify_user_cached(user_id, username)
    if not db_user:
        # 데이터베이스에 존재하지 않는 무효 사용자: 세션 완전 파기 및 쿠키 만료
        session.clear()
        session.modified = True
        if request.is_json or path.startswith('/api/'):
            resp = jsonify({
                "status": "error",
                "message": "유효하지 않은 계정 세션입니다. 다시 로그인해 주세요.",
                "redirect": url_for('login')
            })
            resp.status_code = 401
        else:
            resp = make_response(redirect(url_for('login')))

        cookie_name = app.config.get('SESSION_COOKIE_NAME', 'session')
        resp.delete_cookie(
            cookie_name,
            path=app.config.get('APPLICATION_ROOT', '/'),
            domain=app.config.get('SESSION_COOKIE_DOMAIN', None),
            samesite=app.config.get('SESSION_COOKIE_SAMESITE', 'Lax')
        )
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp

    # 세션 정보 동기화
    sync_session_from_user(db_user)
    return None


GAME_API_PATHS = {'/api/step', '/api/state', '/api/tactic'}
_verify_cache = {}
VERIFY_CACHE_SECONDS = 30


def cached_verify_user(user_id, username):
    key = (user_id, username)
    hit = _verify_cache.get(key)
    now = time.time()
    if hit and now - hit[0] < VERIFY_CACHE_SECONDS:
        return hit[1]
    user = verify_user_cached(user_id, username)
    if user:
        if len(_verify_cache) > 2000:
            _verify_cache.clear()
        _verify_cache[key] = (now, user)
    else:
        _verify_cache.pop(key, None)
    return user


_gzip_cache = {}
_GZIP_TYPES = ('application/json', 'text/html', 'text/css', 'application/javascript', 'text/javascript')


@app.after_request
def gzip_json_response(response):
    """JSON·페이지(HTML)·스타일(css)·스크립트(js)를 압축해 보냄 → 처음 열 때 하얀 화면 시간 단축.
    css/js는 같은 파일을 매번 다시 압축하지 않도록 압축본을 기억해 둠"""
    try:
        if (response.status_code == 200 and response.mimetype in _GZIP_TYPES
                and 'gzip' in request.headers.get('Accept-Encoding', '').lower()
                and 'Content-Encoding' not in response.headers):
            is_static = response.mimetype in ('text/css', 'application/javascript', 'text/javascript')
            if response.direct_passthrough:
                response.direct_passthrough = False
            data = response.get_data()
            if len(data) > 1024:
                import gzip
                key = (request.path, request.args.get('v'), len(data)) if is_static else None
                comp = _gzip_cache.get(key) if key else None
                if comp is None:
                    comp = gzip.compress(data, compresslevel=6 if is_static else 5)
                    if key:
                        _gzip_cache[key] = comp
                response.set_data(comp)
                response.headers['Content-Encoding'] = 'gzip'
                response.headers['Content-Length'] = str(len(comp))
                response.headers.add('Vary', 'Accept-Encoding')
    except Exception:
        pass
    return response


@app.after_request
def add_cache_control_headers(response):
    """모든 응답에 브라우저 캐시 및 뒤로 가기(BFCache) 완전 차단 헤더 적용
    단, 이미지·글꼴과 버전(?v=)이 붙은 css/js는 길게 캐시 (매번 다시 받아 깜빡이지 않도록)"""
    is_media = request.path.endswith(('.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf'))
    is_versioned_asset = request.path.endswith(('.css', '.js')) and request.args.get('v')
    if (is_media or is_versioned_asset) and response.status_code == 200:
        response.headers["Cache-Control"] = "public, max-age=604800"
        response.headers.pop("Pragma", None)
        response.headers.pop("Expires", None)
        return response
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ==============================================================================
# AUTH & PAGE ROUTES
# ==============================================================================

@app.route('/lobby', endpoint='lobby')
@app.route('/index.html', endpoint='index_html')
@app.route('/', endpoint='index')
@login_required
def index():
    """메인 페이지: 세션 로그인 상태 및 SQLite 대조 검사 후 로비 렌더링 (캐시 완전 차단 적용)"""
    user_id = session.get('user_id')
    username = session.get('username')

    # login_required가 방금 DB 기준으로 세션을 동기화했으므로 세션 값을 그대로 사용
    nickname = session['nickname']
    favorite_team = session['favorite_team']
    favorite_team_full = team_full_name(favorite_team)
    favorite_team_logo = team_logo_html(favorite_team) or TEAM_LOGOS.get(favorite_team, '👑')
    favorite_team_color = TEAM_COLORS.get(favorite_team, '#10b981')

    today_str = datetime.date.today().strftime('%Y-%m-%d')
    day_advanced = settle_left_test_day()   # 지난번에 경기를 시작하고 나갔다면 다음 날로
    today_schedule_info, today_games = today_schedule_and_games(today_str, favorite_team)
    today_schedule_info["day_advanced"] = day_advanced
    today_schedule_info["in_progress"] = game_in_progress()
    match_data = today_schedule_info.get('match')
    is_rest_day = today_schedule_info.get('is_rest_day', False)

    match_away_full = TEAM_FULL_NAMES.get(match_data.get('away_team'), match_data.get('away_team')) if match_data else ''
    match_home_full = TEAM_FULL_NAMES.get(match_data.get('home_team'), match_data.get('home_team')) if match_data else ''

    response = make_response(render_template(
        'index.html', 
        user_id=user_id,
        username=username, 
        account_label=session.get('account_label') or username,
        nickname=nickname, 
        favorite_team=favorite_team,
        favorite_team_full=favorite_team_full,
        favorite_team_logo=favorite_team_logo,
        favorite_team_color=favorite_team_color,
        match=match_data,
        is_rest_day=is_rest_day,
        match_away_full=match_away_full,
        match_home_full=match_home_full,
        today_schedule=today_schedule_info,
        initial_standings=(test_standings(favorite_team, test_day())['standings'] if TEST_SEASON
                           else database.compute_standings()['standings']),
        test_season=TEST_SEASON,
        today_games=today_games,
        team_logos=TEAM_LOGOS
    ))
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.route('/api/check-nickname', methods=['GET', 'POST'])
def api_check_nickname():
    """감독 닉네임 중복 확인 API: 2~10자 범위 및 중복 검증"""
    if request.method == 'POST' and request.is_json:
        data = request.get_json(silent=True) or {}
        nickname = data.get('nickname', '').strip()
    else:
        nickname = (request.args.get('nickname') or request.form.get('nickname', '')).strip()

    if not nickname:
        return jsonify({"status": "error", "message": "감독 닉네임을 입력해 주세요.", "available": False}), 400
    if len(nickname) < 2 or len(nickname) > 10:
        return jsonify({"status": "error", "message": "감독 닉네임은 2자 이상 10자 이하로 입력해 주세요.", "available": False}), 400

    exists = database.check_nickname_exists(nickname)
    if exists:
        return jsonify({"status": "error", "message": "이미 사용 중인 닉네임입니다.", "available": False})
    return jsonify({"status": "success", "message": "사용 가능한 닉네임입니다.", "available": True})


SOCIAL_ONLY_MSG = "작전타임은 카카오·네이버·구글 계정으로만 로그인할 수 있어요."


@app.route('/signup', methods=['GET', 'POST'])
@app.route('/find-email', methods=['GET', 'POST'])
@app.route('/forgot-password', methods=['GET', 'POST'])
def signup():
    """소셜 로그인 전용: 이메일 가입·찾기 화면은 로그인 화면(소셜 버튼)으로 안내"""
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    """로그인 화면: 카카오·네이버·구글 버튼만 제공 (처음이면 자동 가입)"""
    if request.method == 'POST':
        if request.is_json:
            return jsonify({"status": "error", "message": SOCIAL_ONLY_MSG}), 400
        return render_template('login.html', error=SOCIAL_ONLY_MSG)

    # GET 요청: 이미 로그인되어 있다면 DB 대조 후 메인으로 이동
    if session.get('user_id') and session.get('username'):
        if verify_user_cached(session.get('user_id'), session.get('username')):
            return redirect(url_for('index'))
        else:
            session.clear()
            session.modified = True
    return render_template('login.html')


@app.route('/logout', methods=['GET', 'POST'])
def logout():
    """로그아웃 기능: 세션 완전 파기, 브라우저 세션 쿠키 삭제 및 로그인 화면으로 강제 이동"""
    session.clear()
    session.modified = True

    if request.is_json:
        response = jsonify({
            "status": "success", 
            "message": "로그아웃되었습니다.", 
            "redirect": url_for('login')
        })
    else:
        response = make_response(redirect(url_for('login')))

    # 브라우저 세션 쿠키 명시적 만료/삭제
    cookie_name = app.config.get('SESSION_COOKIE_NAME', 'session')
    response.delete_cookie(
        cookie_name,
        path=app.config.get('APPLICATION_ROOT', '/'),
        domain=app.config.get('SESSION_COOKIE_DOMAIN', None),
        samesite=app.config.get('SESSION_COOKIE_SAMESITE', 'Lax')
    )

    # 캐시 방지 헤더 주입
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ==============================================================================
# SOCIAL LOGIN (카카오 / 구글 / 네이버)
# ==============================================================================

@app.context_processor
def inject_social_providers():
    """로그인/회원가입 화면에 설정된 소셜 로그인 버튼만 표시 + 약관 화면용 문의 이메일"""
    return {
        'social_providers': social_auth.enabled_providers(),
        'contact_email': os.environ.get('CONTACT_EMAIL', '').strip(),
        'legal_effective_date': LEGAL_EFFECTIVE_DATE,
    }


LEGAL_EFFECTIVE_DATE = '2026년 10월 10일'
TERMS_REQUIRED_MSG = "이용약관 및 개인정보처리방침에 동의해 주세요."


@app.route('/healthz')
def healthz():
    """깨우미(업타임 모니터)용 가벼운 상태 확인 주소: 무료 서버가 잠들지 않도록 주기적으로 호출"""
    return Response('ok', mimetype='text/plain')


@app.route('/apple-touch-icon.png')
@app.route('/apple-touch-icon-precomposed.png')
def apple_touch_icon():
    """사파리 즐겨찾기·홈 화면이 기본 주소로 찾는 앱 아이콘"""
    return send_from_directory(os.path.join(app.static_folder, 'brand'), 'app-icon-180.png', mimetype='image/png')


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.static_folder, 'brand'), 'app-icon-64.png', mimetype='image/png')


@app.route('/privacy')
def privacy():
    return render_template('privacy.html')


@app.route('/terms')
def terms():
    return render_template('terms.html')


def social_redirect_uri(provider):
    """각 개발자 콘솔에 등록할 콜백 주소 (PUBLIC_BASE_URL이 있으면 그 주소 기준)"""
    base = os.environ.get('PUBLIC_BASE_URL', '').strip().rstrip('/')
    if base:
        return base + url_for('social_callback', provider=provider)
    return url_for('social_callback', provider=provider, _external=True)


def login_page_error(msg):
    return render_template('login.html', error=msg)


@app.route('/auth/<provider>/start')
def social_start(provider):
    if not social_auth.is_configured(provider):
        return login_page_error("아직 준비 중인 로그인 방식입니다.")
    state = secrets.token_urlsafe(24)
    session['oauth_state'] = state
    session['oauth_provider'] = provider
    return redirect(social_auth.authorize_url(provider, social_redirect_uri(provider), state))


@app.route('/auth/<provider>/callback')
def social_callback(provider):
    name = database.SOCIAL_PROVIDERS.get(provider, '소셜')
    expected_state = session.pop('oauth_state', None)
    expected_provider = session.pop('oauth_provider', None)

    if request.args.get('error'):
        return login_page_error(f"{name} 로그인이 취소되었습니다.")
    if (not social_auth.is_configured(provider) or provider != expected_provider
            or not expected_state or request.args.get('state') != expected_state):
        return login_page_error(f"{name} 로그인 요청이 만료되었습니다. 다시 시도해 주세요.")

    try:
        profile = social_auth.fetch_profile(provider, request.args.get('code', ''), social_redirect_uri(provider), expected_state)
    except social_auth.SocialLoginError as e:
        print(f"⚠️ [SOCIAL] {provider} 로그인 실패: {e}", flush=True)
        code_note = f" (오류 코드: {e.code})" if e.code else ""
        return login_page_error(f"{name} 로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.{code_note}")
    if not profile.get('id'):
        return login_page_error(f"{name} 계정 정보를 가져오지 못했습니다. 다시 시도해 주세요.")

    user = database.get_social_user(provider, profile['id'])
    if user:
        session.permanent = True
        sync_session_from_user(user)
        database.log_login(session['account_label'], True, 'ok', user['id'], client_ip())
        return redirect(url_for('index'))

    # 첫 로그인: 닉네임/응원 구단을 받는 화면으로 이동
    session['social_pending'] = {
        'provider': provider,
        'id': profile['id'],
        'email': profile.get('email', ''),
    }
    return redirect(url_for('social_signup'))


@app.route('/signup/social', methods=['GET', 'POST'])
def social_signup():
    pending = session.get('social_pending')
    if not pending:
        return redirect(url_for('login'))
    provider_name = database.SOCIAL_PROVIDERS.get(pending['provider'], '소셜')

    if request.method == 'POST':
        nickname = request.form.get('nickname', '').strip()
        favorite_team = normalize_team_short(request.form.get('favorite_team'))
        if not request.form.get('agree_terms'):
            res = {"status": "error", "message": TERMS_REQUIRED_MSG}
        else:
            res = database.create_social_user(pending['provider'], pending['id'], pending.get('email'), nickname, favorite_team)
        if res.get('status') != 'success':
            return render_template('social_signup.html', provider_name=provider_name, pending=pending,
                                   nickname=nickname, favorite_team=favorite_team, error=res.get('message'))
        session.pop('social_pending', None)
        session.permanent = True
        sync_session_from_user(res['user'])
        database.log_login(session['account_label'], True, 'ok', res['user']['id'], client_ip())
        return redirect(url_for('index'))

    return render_template('social_signup.html', provider_name=provider_name, pending=pending,
                           nickname='', favorite_team=None)


# ==============================================================================
# ADMIN ROUTES (보안 비밀 코드 인증)
# ==============================================================================

@app.route('/admin/users', methods=['GET', 'POST'])
def admin_users():
    """관리자 전용 회원 목록 페이지: 보안 비밀 코드 인증 화면(폼) 우선 노출"""
    # 1. POST 폼 입력 또는 URL 쿼리 파라미터(?code=...)로 비밀 코드 제출 시 검증
    input_code = ""
    if request.method == 'POST':
        input_code = request.form.get('code', '').strip()
        if not input_code and request.is_json:
            input_code = (request.get_json(silent=True) or {}).get('code', '').strip()
    if not input_code and request.args.get('code'):
        input_code = request.args.get('code', '').strip()

    if input_code:
        if input_code in ADMIN_VALID_CODES:
            session['admin_authenticated'] = True
        else:
            return render_template('admin_auth.html', error="비밀 코드가 올바르지 않습니다. 다시 입력해 주세요.")

    # 2. 세션 인증 상태 확인 (인증 안 된 경우 무조건 비밀 코드 입력 화면 노출)
    if not session.get('admin_authenticated'):
        return render_template('admin_auth.html')

    # 3. 모든 회원 목록 및 최근 로그인 기록 조회
    users = database.get_all_users()
    login_logs = database.get_recent_login_logs(50)

    # 응원 구단 통계 집계
    team_counts = {}
    for u in users:
        team = u.get('favorite_team') or '미설정'
        team_counts[team] = team_counts.get(team, 0) + 1

    popular_team = max(team_counts.items(), key=lambda x: x[1])[0] if team_counts else '없음 (0명)'

    if request.is_json or request.args.get('format') == 'json':
        return jsonify({
            "status": "success",
            "total_users": len(users),
            "popular_team": popular_team,
            "users": users,
            "login_logs": login_logs
        })

    return render_template(
        'admin_users.html',
        users=users,
        total_users=len(users),
        popular_team=popular_team,
        login_logs=login_logs
    )


@app.route('/admin/games', methods=['GET', 'POST'])
def admin_games():
    """관리자: 경기 일정·결과 입력, 팀 순위 기준값 관리"""
    if not session.get('admin_authenticated'):
        return redirect(url_for('admin_users'))

    selected_date = request.values.get('date') or datetime.date.today().isoformat()
    try:
        selected_date = datetime.date.fromisoformat(selected_date).isoformat()
    except ValueError:
        selected_date = datetime.date.today().isoformat()

    message, error = None, None
    if request.method == 'POST':
        action = request.form.get('action')
        if action == 'save_result':
            res = database.save_game_result(request.form.get('game_id'), request.form.get('status_text'),
                                            request.form.get('away_score'), request.form.get('home_score'),
                                            request.form.get('inning_text', ''), request.form.get('cancel_reason', ''),
                                            request.form.get('current_pitcher', ''))
        elif action == 'add_game':
            res = database.add_game(request.form.get('game_date'), request.form.get('start_time'),
                                    request.form.get('away_team'), request.form.get('home_team'), request.form.get('stadium'))
            if res['status'] == 'success':
                selected_date = request.form.get('game_date') or selected_date
        elif action == 'delete_game':
            res = database.delete_game(request.form.get('game_id'))
        elif action == 'save_base':
            rows = [{'team': t,
                     'wins': request.form.get(f'wins_{t}'),
                     'losses': request.form.get(f'losses_{t}'),
                     'draws': request.form.get(f'draws_{t}'),
                     'streak': request.form.get(f'streak_{t}')} for t in database.KBO_TEAMS]
            res = database.save_standings_base(rows, request.form.get('as_of'))
        else:
            res = {"status": "error", "message": "알 수 없는 요청입니다."}
        if res['status'] == 'success':
            message = res['message']
        else:
            error = res['message']

    games = [g for g in database.get_schedules_by_date(selected_date) if g.get('is_rest_day') != 1]
    base, as_of = database.get_standings_base()
    standings = database.compute_standings()
    day = datetime.date.fromisoformat(selected_date)
    return render_template('admin_games.html', selected_date=selected_date, games=games, base=base, as_of=as_of,
                           prev_date=(day - datetime.timedelta(days=1)).isoformat(),
                           next_date=(day + datetime.timedelta(days=1)).isoformat(),
                           standings=standings, teams=database.KBO_TEAMS, message=message, error=error,
                           innings=database.INNING_OPTIONS, cancel_reasons=database.CANCEL_REASONS,
                           team_full_names=TEAM_FULL_NAMES)


@app.route('/admin/logout')
def admin_logout():
    """관리자 세션 로그아웃"""
    session.pop('admin_authenticated', None)
    return redirect(url_for('admin_users'))


# ==============================================================================
# BASEBALL GAME API ROUTES
# ==============================================================================

@app.route('/api/session')
@app.route('/api/me')
def api_session():
    """현재 세션 유저 정보 조회 API (SQLite users 테이블 실시간 대조)"""
    username = session.get('username')
    user_id = session.get('user_id')
    db_user = None
    if username and user_id:
        db_user = verify_user_cached(user_id, username)
        if not db_user:
            session.clear()
            session.modified = True

    logged_in = bool(db_user)
    fav_team = resolve_user_team(db_user) if logged_in else None
    return jsonify({
        "logged_in": logged_in,
        "username": db_user['username'] if logged_in else None,
        "nickname": (db_user.get('nickname') or (db_user['username'] + " 감독")) if logged_in else None,
        "favorite_team": fav_team,
        "favorite_team_full": team_full_name(fav_team) if logged_in else None,
        "user_id": db_user['id'] if logged_in else None
    })


@app.route('/api/stream')
def api_stream():
    """(예전 화면 호환용) 현재 상태를 한 번만 보내고 연결을 닫음.
    끝없이 열어 두면 서버 작업자를 붙잡아 다른 요청이 모두 밀리는 문제가 있었음"""
    state_data = json.dumps(get_engine().get_state(), ensure_ascii=False)
    return Response(
        f"retry: 600000\ndata: {state_data}\n\n",
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache'}
    )


@app.route('/api/state')
def api_state():
    return jsonify(get_engine().get_state())


@app.route('/api/lobby')
def api_lobby():
    # 세션 로그인 사용자 최우선 적용 (유저 ID 왜곡 및 기본값 덮어쓰기 원천 차단)
    user_id = session.get('user_id')
    req_uid = request.args.get('user_id', type=int)
    if not user_id and req_uid:
        user_id = req_uid
    elif not user_id:
        user_id = 1

    rankings = database.get_user_friends_ranking(user_id)
    user_info = database.get_user_by_id(user_id)
    
    user_score = user_info['score'] if user_info and 'score' in user_info else get_engine().manager_score
    user_grade = user_info['grade'] if user_info and 'grade' in user_info else get_engine().manager_grade
    
    user_team = resolve_user_team(user_info) if user_info else session.get('favorite_team')
    team_full = team_full_name(user_team)

    today_str = datetime.date.today().strftime('%Y-%m-%d')
    today_info, today_games = today_schedule_and_games(today_str, user_team)

    return jsonify({
        "rankings": rankings,
        "history": database.get_tactics_history(session.get('user_id')),
        "user_score": user_score,
        "user_grade": user_grade,
        "user_info": user_info,
        "favorite_team": user_team,
        "favorite_team_full": team_full,
        "today_schedule": today_info,
        "today_games": today_games,
        "countdown": "14분 30초",
        "current_username": session.get('username') or (user_info.get('username') if user_info else '')
    })


@app.route('/api/standings')
def api_standings():
    """팀 순위: 관리자 기준값 + 이후 경기 결과로 자동 계산 (테스트 시즌이면 테스트 1일차부터 쌓인 결과)"""
    if TEST_SEASON:
        return jsonify(test_standings(session.get('favorite_team'), test_day()))
    return jsonify(database.compute_standings())


@app.route('/api/schedules')
def api_schedules():
    date_filter = request.args.get('date')
    if TEST_SEASON:
        games, _ = test_season_games(session.get('favorite_team'), test_day())
        if date_filter:
            games = [g for g in games if g['game_date'] == date_filter]
        return jsonify({"schedules": games, "test_day": test_day(), "test_date": game_engine.test_date(test_day())})
    if date_filter:
        data = database.get_schedules_by_date(date_filter)
    else:
        data = database.get_all_schedules()
    return jsonify({"schedules": data})


@app.route('/api/search_friends')
def api_search_friends():
    uid = session.get('user_id')
    if not uid:
        return jsonify({"results": []})
    query = (request.args.get('query', '') or '').strip()[:20]
    if not query:
        return jsonify({"results": []})
    return jsonify({"results": database.search_users_by_nickname(query, uid)})


def _friend_target():
    data = request.get_json(silent=True) or {}
    try:
        return int(data.get('user_id') or data.get('friend_id') or 0), data
    except (TypeError, ValueError):
        return 0, data


@app.route('/api/friends')
def api_friends():
    """친구 랭킹 + 받은/보낸 친구 요청"""
    uid = session.get('user_id')
    if not uid:
        return jsonify({"status": "error", "message": "로그인이 필요해요."}), 401
    req = database.get_friend_requests(uid)
    return jsonify({"status": "success", "rankings": database.get_user_friends_ranking(uid),
                    "received": req["received"], "sent": req["sent"],
                    "grade_names": game_engine.GRADE_NAMES,
                    "grade_steps": [[c, g] for c, g in game_engine.GRADE_STEPS]})


@app.route('/api/friends/request', methods=['POST'])
@app.route('/api/add_friend', methods=['POST'])
def api_friend_request():
    """친구 요청 보내기 (상대가 수락하면 서로 친구가 됨)"""
    uid = session.get('user_id')
    if not uid:
        return jsonify({"status": "error", "message": "로그인이 필요해요."}), 401
    target, _ = _friend_target()
    return jsonify(database.send_friend_request(uid, target))


@app.route('/api/friends/respond', methods=['POST'])
def api_friend_respond():
    """받은 요청 수락/거절"""
    uid = session.get('user_id')
    if not uid:
        return jsonify({"status": "error", "message": "로그인이 필요해요."}), 401
    target, data = _friend_target()
    return jsonify(database.respond_friend_request(uid, target, bool(data.get('accept'))))


@app.route('/api/friends/remove', methods=['POST'])
def api_friend_remove():
    """친구 삭제 (양쪽 모두)"""
    uid = session.get('user_id')
    if not uid:
        return jsonify({"status": "error", "message": "로그인이 필요해요."}), 401
    target, _ = _friend_target()
    return jsonify(database.remove_friend(uid, target))


@app.route('/api/friends/cancel', methods=['POST'])
def api_friend_cancel():
    """보낸 요청 취소"""
    uid = session.get('user_id')
    if not uid:
        return jsonify({"status": "error", "message": "로그인이 필요해요."}), 401
    target, _ = _friend_target()
    return jsonify(database.cancel_friend_request(uid, target))


@app.route('/api/register', methods=['POST'])
@app.route('/api/login', methods=['POST'])
def api_password_auth_disabled():
    return jsonify({"status": "error", "message": SOCIAL_ONLY_MSG, "redirect": url_for('login')}), 410


@app.route('/api/tactic', methods=['POST'])
def api_tactic():
    data = request.get_json(silent=True) or {}
    tactic_id = data.get('tactic_id')
    # 점수는 항상 로그인한 본인 계정에만 저장 (요청에 담긴 user_id는 믿지 않음)
    user_id = session.get('user_id')
    engine = get_engine()
    res = engine.apply_tactic(tactic_id)
    if res.get('status') == 'success' and user_id:
        database.update_user_score(engine.manager_score, engine.manager_grade, user_id)
    save_engine_snapshot(engine, force=True)
    return jsonify(res)


@app.route('/api/reset', methods=['POST'])
def api_reset():
    data = request.get_json(silent=True) or {}
    home = data.get('home_team', '삼성')
    away = data.get('away_team', '한화')
    home_p = data.get('home_pitcher') or game_engine.TEAMS.get(home, {}).get("pitcher", "페덱")
    away_p = data.get('away_pitcher') or game_engine.TEAMS.get(away, {}).get("pitcher", "박준영")
    if home == away:
        away = '한화' if home != '한화' else '삼성'
    engine = get_engine()
    engine.user_team = session.get('favorite_team')   # 우리 팀 공격 때 대타 팝업
    engine.lineup_date = f"TEST-{test_day()}" if TEST_SEASON else None
    engine.test_day = test_day() if TEST_SEASON else None
    if data.get('resume'):
        st = engine.get_state()
        ongoing = (st.get('home_team') == home and st.get('away_team') == away and not st.get('game_over') and
                   (st.get('totalPitcherCount') or st.get('inning', 1) > 1 or st.get('score_home') or st.get('score_away')
                    or st.get('balls') or st.get('strikes')))
        if ongoing:
            return jsonify({"status": "success", "resumed": True, "state": st})
    engine.home_team_name = home
    engine.away_team_name = away
    engine.home_pitcher = home_p
    engine.away_pitcher = away_p
    engine.reset()
    engine._test_result_saved = False
    engine._history_saved = False
    mark_test_day_started()
    save_engine_snapshot(engine, force=True)
    return jsonify({"status": "success", "message": "경기 초기화 완료", "state": engine.get_state()})


# ---------------- 테스트 시즌 ----------------
# 테스트 동안은 실제 일정 대신, 하루 5경기 가상 시즌으로 진행 (내 경기가 끝나면 다음 날로)
TEST_SEASON = os.environ.get('TEST_SEASON', '1') == '1'


def test_day():
    """테스트 시즌 몇 일차인지 (사용자별로 DB에 저장 → 다른 기기·다시 접속해도 이어짐)"""
    uid = session.get('user_id')
    if not uid:
        return 1
    try:
        return max(1, int(database.get_setting(f"test_day:{uid}", "1") or 1))
    except (TypeError, ValueError):
        return 1


def advance_test_day():
    """다음 날로: 일차 +1, '오늘 경기 시작함' 표시 지움, 서버에 남은 지난 경기도 정리"""
    uid = session.get('user_id')
    nxt = test_day() + 1
    if uid:
        eng = _engines.get(uid)
        # 경기를 시작했는데 끝내지 않고 넘어가면 '중단'으로 내 기록에 남김
        if eng and getattr(eng, 'test_day', None) == nxt - 1 and not eng.game_over and sum(eng.pitch_counts.values()) > 0:
            save_game_history(eng, 'left')
        database.set_setting(f"test_day:{uid}", str(nxt))
        database.set_setting(f"test_started:{uid}", "")
        database.set_setting(f"engine:{uid}", "")
        with _engines_lock:
            _engines.pop(uid, None)
    return nxt


def mark_test_day_started():
    """오늘 경기에 처음 입장(새 경기 시작)했다는 표시 — 이 상태로 앱을 나갔다 오면 다음 날로 넘김"""
    uid = session.get('user_id')
    if uid and TEST_SEASON:
        database.set_setting(f"test_started:{uid}", str(test_day()))


def settle_left_test_day():
    """앱을 다시 열었을 때: 오늘 경기가 끝난 상태로 나갔다면 다음 날로.
    경기 도중에 나갔거나 새로고침했으면 넘기지 않고, 그 시점부터 이어서 진행"""
    uid = session.get('user_id')
    if not (uid and TEST_SEASON):
        return False
    if database.get_setting(f"test_started:{uid}", "") != str(test_day()):
        return False
    eng = get_engine()
    if getattr(eng, 'test_day', None) == test_day() and getattr(eng, 'game_over', False):
        advance_test_day()
        return True
    return False


def game_in_progress():
    """오늘 경기를 시작했고 아직 끝나지 않았는지 (다시 들어오면 이어하기)"""
    uid = session.get('user_id')
    if not (uid and TEST_SEASON) or database.get_setting(f"test_started:{uid}", "") != str(test_day()):
        return False
    eng = get_engine()
    return getattr(eng, 'test_day', None) == test_day() and not getattr(eng, 'game_over', False)


def today_schedule_and_games(today_str, team):
    """홈 화면용 (오늘 내 팀 경기 정보, 오늘 경기 목록). 테스트 시즌이면 가상 일정"""
    if not TEST_SEASON:
        return (database.get_today_schedule_info(today_str, team),
                [g for g in database.get_schedules_by_date(today_str) if g.get('is_rest_day') != 1])
    day = test_day()
    today_str = game_engine.test_date(day)
    all_games, _ = test_season_games(team, day, upto_day=day)
    games = [g for g in all_games if g['test_day'] == day]
    mine = next((g for g in games if team in (g['home_team'], g['away_team'])), None)
    info = {"game_date": today_str, "is_today": True, "is_rest_day": False,
            "start_time": mine['start_time'] if mine else None, "match": mine,
            "all_matches": games, "test_day": day}
    return info, games


# 다른 팀 경기 결과(모든 사용자 공통) / 내 팀 경기 결과(사용자별)
_test_sims_cache = {}


def test_sims(upto_day):
    """1~upto_day일차 다른 팀 경기 결과. 없으면 자동 진행해서 DB에 저장"""
    global _test_sims_cache
    if not _test_sims_cache:
        try:
            _test_sims_cache = json.loads(database.get_setting("test_sims", "{}") or "{}")
        except ValueError:
            _test_sims_cache = {}
    missing = [d for d in range(1, upto_day + 1) if str(d) not in _test_sims_cache]
    if missing:
        for d in missing:
            _test_sims_cache[str(d)] = [game_engine.simulate_test_game(d, i) for i in range(5)]
        database.set_setting("test_sims", json.dumps(_test_sims_cache))
    return _test_sims_cache


def my_test_results():
    uid = session.get('user_id')
    if not uid:
        return {}
    try:
        return json.loads(database.get_setting(f"test_my:{uid}", "{}") or "{}")
    except ValueError:
        return {}


# ---------------- 내 경기 기록 (경기별 히스토리) ----------------
def my_game_history(uid=None):
    uid = uid or session.get('user_id')
    if not uid:
        return []
    try:
        return json.loads(database.get_setting(f"games:{uid}", "[]") or "[]")
    except ValueError:
        return []


def save_game_history(engine, status):
    """경기가 끝나거나(final) 도중에 나간(left) 경기를 내 기록에 저장 (한 경기 한 번)"""
    uid = session.get('user_id')
    if not uid or getattr(engine, '_history_saved', False):
        return
    team = session.get('favorite_team')
    log = list(getattr(engine, 'tactic_log', []) or [])
    hit = sum(1 for t in log if t.get('score_delta', 0) > 0)
    miss = sum(1 for t in log if t.get('score_delta', 0) < 0)
    skip = sum(1 for t in log if t.get('my_choice') == 'SKIP')
    mine_home = team == engine.home_team_name
    my_runs = engine.score_home if mine_home else engine.score_away
    opp_runs = engine.score_away if mine_home else engine.score_home
    in_game = team in (engine.home_team_name, engine.away_team_name)
    if status == 'left':
        result = '중단'
    elif not in_game:
        result = ''
    else:
        result = '승' if my_runs > opp_runs else '패' if my_runs < opp_runs else '무'
    day = getattr(engine, 'test_day', None)
    rec = {
        "day": day,
        "date": game_engine.test_date(day) if day else datetime.date.today().isoformat(),
        "home": engine.home_team_name, "away": engine.away_team_name,
        "score_home": engine.score_home, "score_away": engine.score_away,
        "my_team": team if in_game else None, "result": result, "status": status,
        "inning": engine.inning_str() if callable(getattr(engine, 'inning_str', None)) else f"{engine.inning}회{'초' if engine.is_top else '말'}",
        "start_score": getattr(engine, 'start_score', engine.manager_score), "end_score": engine.manager_score,
        "delta": engine.manager_score - getattr(engine, 'start_score', engine.manager_score),
        "hit": hit, "miss": miss, "skip": skip, "tactics": log,
    }
    games = [g for g in my_game_history(uid) if not (day and g.get("day") == day)]
    games.insert(0, rec)
    database.set_setting(f"games:{uid}", json.dumps(games[:200], ensure_ascii=False))
    engine._history_saved = True


def record_game_end(engine):
    """경기가 끝났으면 내 기록과 (테스트 시즌) 순위용 결과를 저장"""
    if engine.game_over:
        save_game_history(engine, 'final')
        record_test_result(engine)


@app.route('/api/my_games')
def api_my_games():
    """내 기록 탭: 경기별 히스토리 + 전체 요약"""
    games = my_game_history()
    user = database.get_user_by_id(session.get('user_id')) or {}
    hit = sum(g.get('hit', 0) for g in games)
    miss = sum(g.get('miss', 0) for g in games)
    return jsonify({
        "games": games,
        "summary": {
            "score": user.get('score', 2000), "grade": user.get('grade', 'D'),
            "games": len(games), "hit": hit, "miss": miss,
            "skip": sum(g.get('skip', 0) for g in games),
            "rate": round(hit / (hit + miss) * 100) if hit + miss else None,
            "delta": sum(g.get('delta', 0) for g in games),
            "wins": sum(1 for g in games if g.get('result') == '승'),
            "losses": sum(1 for g in games if g.get('result') == '패'),
        }
    })


# ---------------- 미니게임 (9칸, 게임마다 하루 1번 · 도전 10P · 성공 최대 +20P) ----------------
MINIGAME_SLOTS = 9
MINIGAME_COST = 10
MINIGAME_MAX_REWARD = 20
# 테스트 기간: 하루 1번 제한 없음 · 포인트 차감/지급 없음 (연습 모드). 정식 운영 때 MINIGAME_FREE=0
MINIGAME_FREE = os.environ.get('MINIGAME_FREE', '1' if TEST_SEASON else '0') == '1'
_minigame_lock = threading.Lock()


grade_for = game_engine.grade_for


def minigame_day_key():
    """'오늘'의 기준: 테스트 시즌이면 일차, 아니면 실제 날짜"""
    return f"t{test_day()}" if TEST_SEASON else datetime.date.today().isoformat()


def load_minigames(uid):
    try:
        st = json.loads(database.get_setting(f"minigame:{uid}", "") or "{}")
    except (TypeError, ValueError):
        st = {}
    if st.get("day") != minigame_day_key():
        st = {"day": minigame_day_key(), "slots": {}}  # 날이 바뀌면 모두 다시 도전 가능
    st.setdefault("slots", {})
    return st


def adjust_user_score(uid, delta):
    """감독 점수 더하기/빼기 (진행 중인 경기 엔진에도 맞춰서, 경기 점수 변화에는 섞이지 않게)"""
    user = database.get_user_by_id(uid) or {}
    score = int(user.get('score') or 2000) + delta
    grade = grade_for(score)
    database.update_user_score(score, grade, uid)
    eng = _engines.get(uid)
    if eng is not None:
        eng.manager_score = score
        eng.manager_grade = grade
        if hasattr(eng, 'start_score'):
            eng.start_score += delta
    return score, grade


def minigame_payload(uid, st):
    user = database.get_user_by_id(uid) or {}
    slots = []
    for i in range(1, MINIGAME_SLOTS + 1):
        rec = st["slots"].get(str(i)) or {}
        slots.append({"slot": i, "status": rec.get("status", "ready"), "reward": rec.get("reward", 0)})
    return {"status": "success", "day": st["day"], "test_day": test_day() if TEST_SEASON else None,
            "score": user.get('score', 2000), "grade": user.get('grade', 'D'),
            "cost": MINIGAME_COST, "max_reward": MINIGAME_MAX_REWARD, "slots": slots,
            "free": MINIGAME_FREE}


@app.route('/api/minigames')
def api_minigames():
    uid = session.get('user_id')
    if not uid:
        return jsonify({"status": "error", "message": "로그인이 필요해요."}), 401
    st = {"day": minigame_day_key(), "slots": {}} if MINIGAME_FREE else load_minigames(uid)
    return jsonify(minigame_payload(uid, st))


@app.route('/api/minigames/start', methods=['POST'])
def api_minigame_start():
    """도전 시작: 오늘 처음이면 10P를 빼고 '도전 중'으로 표시 (나가도 오늘 도전은 쓴 것으로)"""
    uid = session.get('user_id')
    if not uid:
        return jsonify({"status": "error", "message": "로그인이 필요해요."}), 401
    slot = str((request.get_json(silent=True) or {}).get('slot', ''))
    if slot not in {str(i) for i in range(1, MINIGAME_SLOTS + 1)}:
        return jsonify({"status": "error", "message": "없는 미니게임이에요."}), 400
    if MINIGAME_FREE:  # 테스트 기간: 제한·차감 없이 바로 시작
        return jsonify(minigame_payload(uid, {"day": minigame_day_key(), "slots": {}}))
    with _minigame_lock:
        st = load_minigames(uid)
        if slot in st["slots"]:
            return jsonify({"status": "error", "message": "오늘은 이미 도전했어요. 내일 다시 도전하세요."}), 400
        user = database.get_user_by_id(uid) or {}
        if int(user.get('score') or 0) < MINIGAME_COST:
            return jsonify({"status": "error", "message": "감독 포인트가 부족해요."}), 400
        adjust_user_score(uid, -MINIGAME_COST)
        st["slots"][slot] = {"status": "playing", "reward": 0}
        database.set_setting(f"minigame:{uid}", json.dumps(st))
        return jsonify(minigame_payload(uid, st))


@app.route('/api/minigames/finish', methods=['POST'])
def api_minigame_finish():
    """도전 끝: 성공이면 보상(최대 20P)을 더함"""
    uid = session.get('user_id')
    if not uid:
        return jsonify({"status": "error", "message": "로그인이 필요해요."}), 401
    data = request.get_json(silent=True) or {}
    slot = str(data.get('slot', ''))
    if MINIGAME_FREE:  # 테스트 기간: 포인트 지급 없음
        return jsonify(minigame_payload(uid, {"day": minigame_day_key(), "slots": {}}))
    with _minigame_lock:
        st = load_minigames(uid)
        rec = st["slots"].get(slot)
        if not rec or rec.get("status") != "playing":
            return jsonify({"status": "error", "message": "진행 중인 도전이 없어요."}), 400
        try:
            reward = max(0, min(MINIGAME_MAX_REWARD, int(data.get('reward', 0))))
        except (TypeError, ValueError):
            reward = 0
        success = bool(data.get('success')) and reward > 0
        if success:
            adjust_user_score(uid, reward)
        st["slots"][slot] = {"status": "success" if success else "fail", "reward": reward if success else 0}
        database.set_setting(f"minigame:{uid}", json.dumps(st))
        return jsonify(minigame_payload(uid, st))


def record_test_result(engine):
    """테스트 시즌 내 팀 경기가 끝나면 결과 저장 (팀 순위·일정에 반영)"""
    if not TEST_SEASON or not engine.game_over or getattr(engine, '_test_result_saved', False):
        return
    uid = session.get('user_id')
    day = getattr(engine, 'test_day', None)
    team = session.get('favorite_team')
    if not (uid and day and team in (engine.home_team_name, engine.away_team_name)):
        return
    mine = next((g for g in game_engine.test_season_day(day) if team in (g['home_team'], g['away_team'])), None)
    if not mine or {mine['home_team'], mine['away_team']} != {engine.home_team_name, engine.away_team_name}:
        return
    res = my_test_results()
    res[str(day)] = [engine.score_away, engine.score_home]
    database.set_setting(f"test_my:{uid}", json.dumps(res))
    engine._test_result_saved = True


def test_season_games(team, cur_day, upto_day=None):
    """1~upto_day일차 경기 목록 (끝난 날은 점수·'경기종료'). 내 팀 경기는 내 실제 결과, 없으면(중간 이탈) 자동 진행 결과"""
    upto_day = upto_day or game_engine.TEST_DAYS
    mine = my_test_results()
    done_upto = cur_day if str(cur_day) in mine else cur_day - 1
    sims = test_sims(done_upto) if done_upto >= 1 else {}
    out = []
    for d in range(1, upto_day + 1):
        for i, g in enumerate(game_engine.test_season_day(d)):
            if d <= done_upto:
                is_mine = team in (g['home_team'], g['away_team'])
                a, h = (mine.get(str(d)) if is_mine and str(d) in mine else sims[str(d)][i])
                g.update({"status_text": "경기종료", "away_score": a, "home_score": h})
            out.append(g)
    return out, done_upto


def test_standings(team, cur_day):
    games, done_upto = test_season_games(team, cur_day, upto_day=max(cur_day, 1))
    finished = [g for g in games if g["status_text"] == "경기종료"]
    return {"standings": database.standings_from_results(game_engine.TEST_TEAMS, finished),
            "as_of": game_engine.test_date(1), "updated_through": game_engine.test_date(done_upto) if done_upto else None,
            "test_day": cur_day, "test_done_upto": done_upto}


@app.route('/api/test/next_day', methods=['POST'])
def api_test_next_day():
    """(테스트 시즌) 경기를 마치고 로비로 갈 때 다음 날로 이동"""
    return jsonify({"status": "success", "test_day": advance_test_day()})


@app.route('/api/finish', methods=['POST'])
def api_finish():
    """(테스트용) 지금 경기를 끝까지 진행하고 결과를 돌려줌"""
    engine = get_engine()
    state = engine.finish_game()
    record_game_end(engine)
    return jsonify(state)


@app.route('/api/step', methods=['POST'])
def api_step():
    engine = get_engine()
    state = engine.step_pitch()
    record_game_end(engine)
    save_engine_snapshot(engine, force=engine.game_over)
    return jsonify(state)


# ==============================================================================
# MAIN ENTRY POINT
# ==============================================================================

if __name__ == '__main__':
    print("==================================================")
    print("🚀 실시간 야구 감독 매니지먼트 Flask 웹앱 서버 실행")
    print(f"👉 접속 주소: http://localhost:{PORT}")
    print("==================================================")
    app.run(host='0.0.0.0', port=PORT, debug=False)
