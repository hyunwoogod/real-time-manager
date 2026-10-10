from flask import Flask, render_template, request, redirect, url_for, session, jsonify, Response, make_response
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

# DB 초기화 및 글로벌 게임 엔진 생성
database.init_db()
engine = GameEngine("한화", "롯데")


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
        db_user = database.verify_session_user(user_id, username)
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
        path.endswith(('.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.map', '.webp'))):
        return None

    # 2. 공개 접근 허용 라우트 (로그인/회원가입/중복확인/관리자 인증/상태조회)
    PUBLIC_PATHS = {
        '/login', 
        '/signup', 
        '/logout',
        '/admin/users', 
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

    # 4. SQLite DB users 테이블 실시간 대조 검증
    db_user = database.verify_session_user(user_id, username)
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


@app.after_request
def add_cache_control_headers(response):
    """모든 응답에 브라우저 캐시 및 뒤로 가기(BFCache) 완전 차단 헤더 적용"""
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
    favorite_team_logo = TEAM_LOGOS.get(favorite_team, '👑')
    favorite_team_color = TEAM_COLORS.get(favorite_team, '#10b981')

    today_str = datetime.date.today().strftime('%Y-%m-%d')
    today_schedule_info = database.get_today_schedule_info(today_str, favorite_team)
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
        today_schedule=today_schedule_info
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


SOCIAL_ONLY_MSG = "집감독은 카카오·네이버·구글 계정으로만 로그인할 수 있어요."


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
        if database.verify_session_user(session.get('user_id'), session.get('username')):
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
        db_user = database.verify_session_user(user_id, username)
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
    """SSE (Server-Sent Events) 실시간 라이브 중계 스트림"""
    def event_stream():
        try:
            while True:
                state_data = json.dumps(engine.get_state(), ensure_ascii=False)
                yield f"data: {state_data}\n\n"
                time.sleep(15.0)
        except GeneratorExit:
            pass

    return Response(
        event_stream(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        }
    )


@app.route('/api/state')
def api_state():
    return jsonify(engine.get_state())


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
    
    user_score = user_info['score'] if user_info and 'score' in user_info else engine.manager_score
    user_grade = user_info['grade'] if user_info and 'grade' in user_info else engine.manager_grade
    
    user_team = resolve_user_team(user_info) if user_info else session.get('favorite_team')
    team_full = team_full_name(user_team)

    today_str = datetime.date.today().strftime('%Y-%m-%d')
    today_info = database.get_today_schedule_info(today_str, user_team)

    return jsonify({
        "rankings": rankings,
        "history": database.get_tactics_history(),
        "user_score": user_score,
        "user_grade": user_grade,
        "user_info": user_info,
        "favorite_team": user_team,
        "favorite_team_full": team_full,
        "today_schedule": today_info,
        "countdown": "14분 30초",
        "current_username": session.get('username') or (user_info.get('username') if user_info else '')
    })


@app.route('/api/schedules')
def api_schedules():
    date_filter = request.args.get('date')
    if date_filter:
        data = database.get_schedules_by_date(date_filter)
    else:
        data = database.get_all_schedules()
    return jsonify({"schedules": data})


@app.route('/api/search_friends')
def api_search_friends():
    query = request.args.get('query', '')
    current_user_id = request.args.get('user_id', type=int) or session.get('user_id', 1)
    results = database.search_users_by_nickname(query, current_user_id)
    return jsonify({"results": results})


@app.route('/api/register', methods=['POST'])
@app.route('/api/login', methods=['POST'])
def api_password_auth_disabled():
    return jsonify({"status": "error", "message": SOCIAL_ONLY_MSG, "redirect": url_for('login')}), 410


@app.route('/api/add_friend', methods=['POST'])
def api_add_friend():
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id') or session.get('user_id', 1)
    friend_id = data.get('friend_id', 0)
    try:
        user_id = int(user_id)
        friend_id = int(friend_id)
    except (ValueError, TypeError):
        pass
    res = database.add_friend(user_id, friend_id)
    return jsonify(res)


@app.route('/api/tactic', methods=['POST'])
def api_tactic():
    data = request.get_json(silent=True) or {}
    tactic_id = data.get('tactic_id')
    user_id = data.get('user_id') or session.get('user_id', 1)
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        user_id = 1
    res = engine.apply_tactic(tactic_id)
    if res.get('status') == 'success':
        database.update_user_score(engine.manager_score, engine.manager_grade, user_id)
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
    engine.home_team_name = home
    engine.away_team_name = away
    engine.home_pitcher = home_p
    engine.away_pitcher = away_p
    engine.reset()
    return jsonify({"status": "success", "message": "경기 초기화 완료", "state": engine.get_state()})


@app.route('/api/step', methods=['POST'])
def api_step():
    state = engine.step_pitch()
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
