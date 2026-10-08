from flask import Flask, render_template, request, redirect, url_for, session, jsonify, Response
import os
import sys
import json
import time
import datetime
import database
import game_engine
from game_engine import GameEngine

app = Flask(__name__, static_folder='static', static_url_path='', template_folder='templates')
app.secret_key = os.environ.get('SECRET_KEY', 'zipgamdok-secret-baseball-key-2026')
ADMIN_SECRET_CODE = os.environ.get('ADMIN_SECRET_CODE', 'zipgamdok2026!')

PORT = int(os.environ.get('PORT', 8000))

# DB 초기화 및 글로벌 게임 엔진 생성
database.init_db()
engine = GameEngine("한화", "롯데")


# ==============================================================================
# AUTH & PAGE ROUTES
# ==============================================================================

@app.route('/')
def index():
    """메인 페이지: 세션 로그인 상태 및 응원 팀에 따라 맞춤 화면 표시"""
    username = session.get('username')
    favorite_team = session.get('favorite_team', '한화')
    return render_template('index.html', username=username, favorite_team=favorite_team)


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    """회원가입 기능: 아이디, 비밀번호, 응원 구단을 입력받아 SQLite users 테이블에 저장"""
    if request.method == 'POST':
        if request.is_json:
            data = request.get_json(silent=True) or {}
            username = data.get('username', '').strip()
            password = data.get('password', '').strip()
            favorite_team = data.get('favorite_team') or data.get('team') or '한화'
        else:
            username = request.form.get('username', '').strip()
            password = request.form.get('password', '').strip()
            favorite_team = request.form.get('favorite_team') or request.form.get('team') or '한화'

        if not username or not password:
            error_msg = "아이디와 비밀번호를 모두 입력해주세요."
            if request.is_json:
                return jsonify({"status": "error", "message": error_msg}), 400
            return render_template('signup.html', error=error_msg)

        res = database.register_user(username=username, password=password, favorite_team=favorite_team, team=favorite_team)
        if res.get('status') == 'success':
            if request.is_json:
                return jsonify({
                    "status": "success",
                    "message": "회원가입되었습니다! 로그인 화면으로 가기",
                    "username": username,
                    "favorite_team": favorite_team,
                    "redirect": url_for('login')
                })
            # 안내 화면: "회원가입되었습니다! 로그인 화면으로 가기" 버튼 및 문구 제공
            return render_template('signup_success.html', username=username, favorite_team=favorite_team)
        else:
            error_msg = res.get('message', '회원가입 처리 중 오류가 발생했습니다.')
            if request.is_json:
                return jsonify({"status": "error", "message": error_msg}), 400
            return render_template('signup.html', error=error_msg)

    # GET 요청: 이미 로그인되어 있다면 메인으로 이동
    if 'username' in session:
        return redirect(url_for('index'))
    return render_template('signup.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    """로그인 기능: SQLite 일치 확인 후 Flask session에 사용자 이름 및 응원 구단 저장 및 세션 유지"""
    if request.method == 'POST':
        if request.is_json:
            data = request.get_json(silent=True) or {}
            username = data.get('username', '').strip()
            password = data.get('password', '').strip()
        else:
            username = request.form.get('username', '').strip()
            password = request.form.get('password', '').strip()

        if not username or not password:
            error_msg = "아이디와 비밀번호를 모두 입력해주세요."
            if request.is_json:
                return jsonify({"status": "error", "message": error_msg}), 400
            return render_template('login.html', error=error_msg)

        res = database.login_user(username, password)
        if res.get('status') == 'success':
            user_info = res.get('user', {})
            session['username'] = username
            session['user_id'] = user_info.get('id', 1)
            session['favorite_team'] = user_info.get('favorite_team') or user_info.get('team') or '한화'

            if request.is_json:
                return jsonify({
                    "status": "success",
                    "username": username,
                    "favorite_team": session['favorite_team'],
                    "user": user_info,
                    "redirect": url_for('index')
                })
            return redirect(url_for('index'))
        else:
            error_msg = res.get('message', '아이디 또는 비밀번호가 일치하지 않습니다.')
            if request.is_json:
                return jsonify({"status": "error", "message": error_msg}), 401
            return render_template('login.html', error=error_msg)

    # GET 요청: 이미 로그인되어 있다면 메인으로 이동
    if 'username' in session:
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/logout', methods=['GET', 'POST'])
def logout():
    """로그아웃 기능: 세션 삭제 후 메인 페이지 또는 로그인 화면으로 이동"""
    session.pop('username', None)
    session.pop('user_id', None)
    session.pop('favorite_team', None)
    if request.is_json:
        return jsonify({"status": "success", "message": "로그아웃되었습니다.", "redirect": url_for('index')})
    return redirect(url_for('index'))


# ==============================================================================
# ADMIN ROUTES (보안 비밀 코드 인증)
# ==============================================================================

@app.route('/admin/users', methods=['GET', 'POST'])
def admin_users():
    """관리자 전용 회원 목록 페이지: 보안 비밀 코드 인증 장치 적용 (?code=... 또는 로그인 폼)"""
    # 1. URL 쿼리 파라미터(?code=...) 또는 POST 폼을 통한 코드 확인
    input_code = (request.args.get('code') or request.form.get('code', '')).strip()

    if input_code:
        if input_code == ADMIN_SECRET_CODE:
            session['admin_authenticated'] = True
        else:
            return render_template('admin_auth.html', error="비밀 코드가 올바르지 않습니다. 다시 입력해 주세요.")

    # 2. 세션 인증 상태 확인
    if not session.get('admin_authenticated'):
        return render_template('admin_auth.html')

    # 3. 모든 회원 목록 조회
    users = database.get_all_users()

    # 응원 구단 통계 집계
    team_counts = {}
    for u in users:
        team = u.get('favorite_team') or '한화'
        team_counts[team] = team_counts.get(team, 0) + 1

    popular_team = max(team_counts.items(), key=lambda x: x[1])[0] if team_counts else '-'

    return render_template(
        'admin_users.html',
        users=users,
        total_users=len(users),
        popular_team=popular_team
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
    """현재 세션 유저 정보 조회 API"""
    username = session.get('username')
    return jsonify({
        "logged_in": bool(username),
        "username": username,
        "favorite_team": session.get('favorite_team', '한화'),
        "user_id": session.get('user_id')
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
    user_id = request.args.get('user_id', type=int)
    if not user_id:
        user_id = session.get('user_id', 1)

    rankings = database.get_user_friends_ranking(user_id)
    user_info = database.get_user_by_id(user_id)
    
    user_score = user_info['score'] if user_info else engine.manager_score
    user_grade = user_info['grade'] if user_info else engine.manager_grade
    user_team = (user_info.get('favorite_team') or user_info.get('team')) if user_info else session.get('favorite_team', "한화")

    today_str = datetime.date.today().strftime('%Y-%m-%d')
    today_info = database.get_today_schedule_info(today_str, user_team)

    return jsonify({
        "rankings": rankings,
        "history": database.get_tactics_history(),
        "user_score": user_score,
        "user_grade": user_grade,
        "user_info": user_info,
        "favorite_team": user_team,
        "today_schedule": today_info,
        "countdown": "14분 30초",
        "current_username": session.get('username')
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
def api_register():
    data = request.get_json(silent=True) or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    email = data.get('email', '').strip()
    marketing_agreed = data.get('marketing_agreed', False)
    nickname = data.get('nickname', '김명장').strip()
    favorite_team = data.get('favorite_team') or data.get('team', '한화').strip()

    if not username or not password:
        return jsonify({"status": "error", "message": "필수 정보를 모두 입력해주세요."}), 400

    res = database.register_user(username, password, email, marketing_agreed, nickname, team=favorite_team, favorite_team=favorite_team)
    if res.get('status') == 'success':
        session['username'] = username
        session['user_id'] = res.get('user', {}).get('id', 1)
        session['favorite_team'] = favorite_team
    return jsonify(res)


@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json(silent=True) or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({"status": "error", "message": "아이디와 비밀번호를 입력해주세요."}), 400

    res = database.login_user(username, password)
    if res.get('status') == 'success':
        user_info = res.get('user', {})
        session['username'] = username
        session['user_id'] = user_info.get('id', 1)
        session['favorite_team'] = user_info.get('favorite_team') or user_info.get('team') or '한화'
    return jsonify(res)


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
