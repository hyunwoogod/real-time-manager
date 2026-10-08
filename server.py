import http.server
import socketserver
import json
import os
import sys
import time
import datetime
import urllib.parse
from socketserver import ThreadingMixIn
import database
import game_engine
from game_engine import GameEngine

PORT = 8000
STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')

# DB 초기화 및 글로벌 게임 엔진 생성
database.init_db()
engine = GameEngine("한화", "롯데")

class ThreadedHTTPServer(ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, format, *args):
        """정상 2xx/3xx 로그는 stdout(server.log)으로, 4xx/5xx 에러만 stderr(server_error.log)로 분리"""
        message = "%s - - [%s] %s\n" % (
            self.address_string(),
            self.log_date_time_string(),
            format % args
        )
        if len(args) > 1 and str(args[1]).isdigit() and int(args[1]) >= 400:
            sys.stderr.write(message)
            sys.stderr.flush()
        else:
            sys.stdout.write(message)
            sys.stdout.flush()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        try:
            url = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(url.query)
            
            if url.path == '/api/stream':
                self.handle_sse_stream()
                return
            elif url.path == '/api/state':
                self.send_json(engine.get_state())
                return
            elif url.path == '/api/lobby':
                try:
                    user_id = int(params.get('user_id', [1])[0])
                except (ValueError, TypeError, IndexError):
                    user_id = 1
                rankings = database.get_user_friends_ranking(user_id)
                user_info = database.get_user_by_id(user_id)
                
                user_score = user_info['score'] if user_info else engine.manager_score
                user_grade = user_info['grade'] if user_info else engine.manager_grade
                user_team = user_info['team'] if user_info else "한화"

                today_str = datetime.date.today().strftime('%Y-%m-%d')
                today_info = database.get_today_schedule_info(today_str, user_team)

                self.send_json({
                    "rankings": rankings,
                    "history": database.get_tactics_history(),
                    "user_score": user_score,
                    "user_grade": user_grade,
                    "user_info": user_info,
                    "today_schedule": today_info,
                    "countdown": "14분 30초"
                })
                return
            elif url.path == '/api/schedules':
                date_filter = params.get('date', [None])[0]
                if date_filter:
                    data = database.get_schedules_by_date(date_filter)
                else:
                    data = database.get_all_schedules()
                self.send_json({"schedules": data})
                return
            elif url.path == '/api/search_friends':
                query = params.get('query', [''])[0]
                try:
                    current_user_id = int(params.get('user_id', [1])[0])
                except (ValueError, TypeError, IndexError):
                    current_user_id = 1
                results = database.search_users_by_nickname(query, current_user_id)
                self.send_json({"results": results})
                return

            # 기본 Static 파일 서빙 (index.html, style.css, app.js 등)
            super().do_GET()
        except Exception as e:
            sys.stderr.write(f"[ERROR do_GET] {str(e)}\n")
            self.send_json({"status": "error", "message": str(e)}, 500)

    def do_POST(self):
        try:
            url = urllib.parse.urlparse(self.path)
            length = int(self.headers.get('Content-Length', 0))
            body_bytes = self.rfile.read(length) if length > 0 else b'{}'
            
            try:
                body = json.loads(body_bytes.decode('utf-8'))
            except Exception:
                body = {}

            if url.path == '/api/register':
                username = body.get('username', '').strip()
                password = body.get('password', '').strip()
                email = body.get('email', '').strip()
                marketing_agreed = body.get('marketing_agreed', False)
                nickname = body.get('nickname', '김명장').strip()
                team = body.get('team', '한화').strip()

                if not username or not password or not email:
                    self.send_json({"status": "error", "message": "필수 정보를 모두 입력해주세요."}, 400)
                    return

                res = database.register_user(username, password, email, marketing_agreed, nickname, team)
                self.send_json(res)
                return

            elif url.path == '/api/login':
                username = body.get('username', '').strip()
                password = body.get('password', '').strip()

                if not username or not password:
                    self.send_json({"status": "error", "message": "아이디와 비밀번호를 입력해주세요."}, 400)
                    return

                res = database.login_user(username, password)
                self.send_json(res)
                return

            elif url.path == '/api/add_friend':
                try:
                    user_id = int(body.get('user_id', 1))
                except (ValueError, TypeError):
                    user_id = 1
                try:
                    friend_id = int(body.get('friend_id', 0))
                except (ValueError, TypeError):
                    friend_id = 0
                res = database.add_friend(user_id, friend_id)
                self.send_json(res)
                return

            elif url.path == '/api/tactic':
                tactic_id = body.get('tactic_id')
                try:
                    user_id = int(body.get('user_id', 1))
                except (ValueError, TypeError):
                    user_id = 1
                res = engine.apply_tactic(tactic_id)
                if res.get('status') == 'success':
                    database.update_user_score(engine.manager_score, engine.manager_grade, user_id)
                self.send_json(res)
                return

            elif url.path == '/api/reset':
                home = body.get('home_team', '삼성')
                away = body.get('away_team', '한화')
                home_p = body.get('home_pitcher') or game_engine.TEAMS.get(home, {}).get("pitcher", "페덱")
                away_p = body.get('away_pitcher') or game_engine.TEAMS.get(away, {}).get("pitcher", "박준영")
                if home == away:
                    away = '한화' if home != '한화' else '삼성'
                engine.home_team_name = home
                engine.away_team_name = away
                engine.home_pitcher = home_p
                engine.away_pitcher = away_p
                engine.reset()
                self.send_json({"status": "success", "message": "경기 초기화 완료", "state": engine.get_state()})
                return

            elif url.path == '/api/step':
                state = engine.step_pitch()
                self.send_json(state)
                return

            self.send_error(404, "API not found")
        except Exception as e:
            sys.stderr.write(f"[ERROR do_POST] {str(e)}\n")
            self.send_json({"status": "error", "message": str(e)}, 500)

    def handle_sse_stream(self):
        """SSE (Server-Sent Events) 라이브 중계 스트림"""
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        try:
            while True:
                state_data = json.dumps(engine.get_state(), ensure_ascii=False)
                payload = f"data: {state_data}\n\n"
                self.wfile.write(payload.encode('utf-8'))
                self.wfile.flush()
                
                time.sleep(15.0) # 15초마다 1구/상황 단위 스트리밍
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

def run_server():
    try:
        server = ThreadedHTTPServer(('0.0.0.0', PORT), RequestHandler)
        print(f"==================================================")
        print(f"🚀 실시간 야구 감독 매니지먼트 웹앱 서버 실행 중")
        print(f"👉 접속 주소: http://localhost:{PORT}")
        print(f"==================================================")
        server.serve_forever()
    except OSError as e:
        if e.errno == 48:
            print(f"⚠️ [오류] 포트 {PORT}번이 이미 다른 프로세스에서 사용 중입니다.")
            print(f"👉 해결 방법: 터미널에서 'lsof -i :{PORT}' 또는 'kill -9 <PID>'로 기존 프로세스를 종료한 후 다시 실행해 주세요.")
            sys.stderr.write(f"[OSError 48] Address already in use on port {PORT}\n")
        else:
            print(f"⚠️ [오류] 서버 실행 중 네트워크 오류 발생: {e}")
            sys.stderr.write(f"[OSError] {e}\n")
    except KeyboardInterrupt:
        print("\n🛑 서버가 사용자에 의해 중지되었습니다.")
    except Exception as e:
        print(f"⚠️ [오류] 서버 예기치 않은 오류: {e}")
        sys.stderr.write(f"[ServerError] {e}\n")

if __name__ == '__main__':
    run_server()
