import random
import time
import zlib
import database
from rosters import ROSTERS

TEAMS = {
    "삼성": {
        "color": "#005CB9",
        "logo": "🦁",
        "pitcher": "페덱",
        "batters": ["김지찬", "이재현", "구자욱", "맥키넌", "강민호", "김영웅", "박병호", "이성규", "류지혁"],
        "fielders": [
            {"role": "P", "name": "페덱", "x": 50, "y": 53, "avatar": "🧢"},
            {"role": "C", "name": "강민호", "x": 50, "y": 84, "avatar": "⚾"},
            {"role": "1B", "name": "맥키넌", "x": 74, "y": 56, "avatar": "🧢"},
            {"role": "2B", "name": "류지혁", "x": 63, "y": 37, "avatar": "🧢"},
            {"role": "3B", "name": "김영웅", "x": 26, "y": 56, "avatar": "🧢"},
            {"role": "SS", "name": "이재현", "x": 37, "y": 37, "avatar": "🧢"},
            {"role": "LF", "name": "구자욱", "x": 22, "y": 24, "avatar": "🧢"},
            {"role": "CF", "name": "김지찬", "x": 50, "y": 15, "avatar": "🧢"},
            {"role": "RF", "name": "이성규", "x": 78, "y": 24, "avatar": "🧢"}
        ]
    },
    "한화": {
        "color": "#FF6600",
        "logo": "🦅",
        "pitcher": "박준영",
        "batters": ["황영묵", "페라자", "노시환", "채은성", "안치홍", "김태연", "최인호", "최재훈", "장진혁"],
        "fielders": [
            {"role": "P", "name": "박준영", "x": 50, "y": 53, "avatar": "🧢"},
            {"role": "C", "name": "최재훈", "x": 50, "y": 84, "avatar": "⚾"},
            {"role": "1B", "name": "채은성", "x": 74, "y": 56, "avatar": "🧢"},
            {"role": "2B", "name": "안치홍", "x": 63, "y": 37, "avatar": "🧢"},
            {"role": "3B", "name": "노시환", "x": 26, "y": 56, "avatar": "🧢"},
            {"role": "SS", "name": "황영묵", "x": 37, "y": 37, "avatar": "🧢"},
            {"role": "LF", "name": "최인호", "x": 22, "y": 24, "avatar": "🧢"},
            {"role": "CF", "name": "장진혁", "x": 50, "y": 15, "avatar": "🧢"},
            {"role": "RF", "name": "페라자", "x": 78, "y": 24, "avatar": "🧢"}
        ]
    },
    "KIA": {
        "color": "#EA0029",
        "logo": "🐯",
        "pitcher": "올러",
        "batters": ["박찬호", "소크라테스", "김도영", "최형우", "나성범", "김선빈", "이우성", "한준수", "최원준"],
        "fielders": [
            {"role": "P", "name": "양현종", "x": 50, "y": 53, "avatar": "🧢"},
            {"role": "C", "name": "한준수", "x": 50, "y": 84, "avatar": "⚾"},
            {"role": "1B", "name": "이우성", "x": 74, "y": 56, "avatar": "🧢"},
            {"role": "2B", "name": "김선빈", "x": 63, "y": 37, "avatar": "🧢"},
            {"role": "3B", "name": "김도영", "x": 26, "y": 56, "avatar": "🧢"},
            {"role": "SS", "name": "박찬호", "x": 37, "y": 37, "avatar": "🧢"},
            {"role": "LF", "name": "최형우", "x": 22, "y": 24, "avatar": "🧢"},
            {"role": "CF", "name": "최원준", "x": 50, "y": 15, "avatar": "🧢"},
            {"role": "RF", "name": "나성범", "x": 78, "y": 24, "avatar": "🧢"}
        ]
    },
    "LG": {
        "color": "#C30452",
        "logo": "🧢",
        "pitcher": "임찬규",
        "batters": ["홍창기", "신민재", "오스틴", "문보경", "오지환", "김현수", "박동원", "박해민", "구본혁"],
        "fielders": [
            {"role": "P", "name": "임찬규", "x": 50, "y": 53, "avatar": "🧢"},
            {"role": "C", "name": "박동원", "x": 50, "y": 84, "avatar": "⚾"},
            {"role": "1B", "name": "오스틴", "x": 74, "y": 56, "avatar": "🧢"},
            {"role": "2B", "name": "신민재", "x": 63, "y": 37, "avatar": "🧢"},
            {"role": "3B", "name": "문보경", "x": 26, "y": 56, "avatar": "🧢"},
            {"role": "SS", "name": "오지환", "x": 37, "y": 37, "avatar": "🧢"},
            {"role": "LF", "name": "김현수", "x": 22, "y": 24, "avatar": "🧢"},
            {"role": "CF", "name": "박해민", "x": 50, "y": 15, "avatar": "🧢"},
            {"role": "RF", "name": "홍창기", "x": 78, "y": 24, "avatar": "🧢"}
        ]
    },
    "SSG": {
        "color": "#CE0E2D",
        "logo": "🐶",
        "pitcher": "김광현",
        "batters": ["최지훈", "박성한", "최정", "에레디아", "한유섬", "하재훈", "고명준", "이지영", "오태곤"],
        "fielders": [
            {"role": "P", "name": "김광현", "x": 50, "y": 53, "avatar": "🧢"},
            {"role": "C", "name": "이지영", "x": 50, "y": 84, "avatar": "⚾"},
            {"role": "1B", "name": "고명준", "x": 74, "y": 56, "avatar": "🧢"},
            {"role": "2B", "name": "오태곤", "x": 63, "y": 37, "avatar": "🧢"},
            {"role": "3B", "name": "최정", "x": 26, "y": 56, "avatar": "🧢"},
            {"role": "SS", "name": "박성한", "x": 37, "y": 37, "avatar": "🧢"},
            {"role": "LF", "name": "에레디아", "x": 22, "y": 24, "avatar": "🧢"},
            {"role": "CF", "name": "최지훈", "x": 50, "y": 15, "avatar": "🧢"},
            {"role": "RF", "name": "한유섬", "x": 78, "y": 24, "avatar": "🧢"}
        ]
    },
    "두산": {
        "color": "#131230",
        "logo": "🐻",
        "pitcher": "곽빈",
        "batters": ["정수빈", "허경민", "양의지", "김재환", "양석환", "강승호", "제러드", "전민재", "조수행"],
        "fielders": [
            {"role": "P", "name": "곽빈", "x": 50, "y": 53, "avatar": "🧢"},
            {"role": "C", "name": "양의지", "x": 50, "y": 84, "avatar": "⚾"},
            {"role": "1B", "name": "양석환", "x": 74, "y": 56, "avatar": "🧢"},
            {"role": "2B", "name": "강승호", "x": 63, "y": 37, "avatar": "🧢"},
            {"role": "3B", "name": "허경민", "x": 26, "y": 56, "avatar": "🧢"},
            {"role": "SS", "name": "전민재", "x": 37, "y": 37, "avatar": "🧢"},
            {"role": "LF", "name": "김재환", "x": 22, "y": 24, "avatar": "🧢"},
            {"role": "CF", "name": "정수빈", "x": 50, "y": 15, "avatar": "🧢"},
            {"role": "RF", "name": "제러드", "x": 78, "y": 24, "avatar": "🧢"}
        ]
    },
    "NC": {
        "color": "#071D49",
        "logo": "🦖",
        "pitcher": "이재학",
        "batters": ["박민우", "권희동", "데이비슨", "손아섭", "서호철", "김휘집", "김성욱", "김형준", "최정원"],
        "fielders": [
            {"role": "P", "name": "이재학", "x": 50, "y": 53, "avatar": "🧢"},
            {"role": "C", "name": "김형준", "x": 50, "y": 84, "avatar": "⚾"},
            {"role": "1B", "name": "데이비슨", "x": 74, "y": 56, "avatar": "🧢"},
            {"role": "2B", "name": "박민우", "x": 63, "y": 37, "avatar": "🧢"},
            {"role": "3B", "name": "서호철", "x": 26, "y": 56, "avatar": "🧢"},
            {"role": "SS", "name": "김휘집", "x": 37, "y": 37, "avatar": "🧢"},
            {"role": "LF", "name": "권희동", "x": 22, "y": 24, "avatar": "🧢"},
            {"role": "CF", "name": "최정원", "x": 50, "y": 15, "avatar": "🧢"},
            {"role": "RF", "name": "손아섭", "x": 78, "y": 24, "avatar": "🧢"}
        ]
    },
    "KT": {
        "color": "#000000",
        "logo": "🧙",
        "pitcher": "고영표",
        "batters": ["멜 로하스", "강백호", "허경민", "오재일", "장성우", "황재균", "김민혁", "심우준", "배정대"],
        "fielders": [
            {"role": "P", "name": "고영표", "x": 50, "y": 53, "avatar": "🧢"},
            {"role": "C", "name": "장성우", "x": 50, "y": 84, "avatar": "⚾"},
            {"role": "1B", "name": "오재일", "x": 74, "y": 56, "avatar": "🧢"},
            {"role": "2B", "name": "강백호", "x": 63, "y": 37, "avatar": "🧢"},
            {"role": "3B", "name": "황재균", "x": 26, "y": 56, "avatar": "🧢"},
            {"role": "SS", "name": "심우준", "x": 37, "y": 37, "avatar": "🧢"},
            {"role": "LF", "name": "멜 로하스", "x": 22, "y": 24, "avatar": "🧢"},
            {"role": "CF", "name": "배정대", "x": 50, "y": 15, "avatar": "🧢"},
            {"role": "RF", "name": "김민혁", "x": 78, "y": 24, "avatar": "🧢"}
        ]
    },
    "키움": {
        "color": "#570514",
        "logo": "🦸",
        "pitcher": "하영민",
        "batters": ["이주형", "김혜성", "송성문", "최주환", "고영우", "김건희", "장재영", "김태진", "원성준"],
        "fielders": [
            {"role": "P", "name": "하영민", "x": 50, "y": 53, "avatar": "🧢"},
            {"role": "C", "name": "김건희", "x": 50, "y": 84, "avatar": "⚾"},
            {"role": "1B", "name": "최주환", "x": 74, "y": 56, "avatar": "🧢"},
            {"role": "2B", "name": "김혜성", "x": 63, "y": 37, "avatar": "🧢"},
            {"role": "3B", "name": "송성문", "x": 26, "y": 56, "avatar": "🧢"},
            {"role": "SS", "name": "고영우", "x": 37, "y": 37, "avatar": "🧢"},
            {"role": "LF", "name": "이주형", "x": 22, "y": 24, "avatar": "🧢"},
            {"role": "CF", "name": "원성준", "x": 50, "y": 15, "avatar": "🧢"},
            {"role": "RF", "name": "장재영", "x": 78, "y": 24, "avatar": "🧢"}
        ]
    },
    "롯데": {
        "color": "#041E42",
        "logo": "⚓",
        "pitcher": "반즈",
        "batters": ["황성빈", "윤동희", "레이예스", "전준우", "나승엽", "손성빈", "정훈", "노진혁", "박승욱"],
        "fielders": [
            {"role": "P", "name": "반즈", "x": 50, "y": 53, "avatar": "🧢"},
            {"role": "C", "name": "손성빈", "x": 50, "y": 84, "avatar": "⚾"},
            {"role": "1B", "name": "나승엽", "x": 74, "y": 56, "avatar": "🧢"},
            {"role": "2B", "name": "고승민", "x": 63, "y": 37, "avatar": "🧢"},
            {"role": "3B", "name": "노진혁", "x": 26, "y": 56, "avatar": "🧢"},
            {"role": "SS", "name": "박승욱", "x": 37, "y": 37, "avatar": "🧢"},
            {"role": "LF", "name": "전준우", "x": 22, "y": 24, "avatar": "🧢"},
            {"role": "CF", "name": "황성빈", "x": 50, "y": 15, "avatar": "🧢"},
            {"role": "RF", "name": "윤동희", "x": 78, "y": 24, "avatar": "🧢"}
        ]
    }
}


def _seed(name, salt=""):
    """선수 이름으로 고정된 0~1 값 (서버를 다시 켜도 같은 선수는 같은 가상 능력치)"""
    return zlib.crc32(f"{salt}:{name}".encode("utf-8")) / 0xFFFFFFFF

# 수비 위치별 그라운드 좌표 (화면 표시용)
POS_COORDS = {
    "P": (50, 53), "C": (50, 84), "1B": (74, 56), "2B": (63, 37), "3B": (26, 56),
    "SS": (37, 37), "LF": (22, 24), "CF": (50, 15), "RF": (78, 24),
}


def _apply_rosters():
    """rosters.py의 최신 로스터로 TEAMS의 선발투수·타순·수비 배치를 덮어씀 (색·로고는 유지)"""
    for code, r in ROSTERS.items():
        team = TEAMS.setdefault(code, {"color": "#333333", "logo": "⚾"})
        starter = r["rotation"][0]["name"]
        team["pitcher"] = starter
        team["batters"] = [b["name"] for b in r["lineup"]]
        fielders = [{"role": "P", "name": starter, "x": 50, "y": 53, "avatar": "🧢"}]
        for b in r["lineup"]:
            if b["pos"] in POS_COORDS and b["pos"] != "P":
                x, y = POS_COORDS[b["pos"]]
                fielders.append({"role": b["pos"], "name": b["name"], "x": x, "y": y,
                                 "avatar": "⚾" if b["pos"] == "C" else "🧢"})
        team["fielders"] = fielders
        team["roster"] = r


_apply_rosters()

BATTER_STATS = {
    # 삼성 라이온즈
    "김지찬": {"order": "1번타자", "avg": "0.316"},
    "이재현": {"order": "2번타자", "avg": "0.278"},
    "구자욱": {"order": "3번타자", "avg": "0.343"},
    "맥키넌": {"order": "4번타자", "avg": "0.294"},
    "강민호": {"order": "5번타자", "avg": "0.303"},
    "김영웅": {"order": "6번타자", "avg": "0.268"},
    "박병호": {"order": "7번타자", "avg": "0.255"},
    "이성규": {"order": "8번타자", "avg": "0.262"},
    "류지혁": {"order": "9번타자", "avg": "0.270"},

    # 한화 이글스
    "황영묵": {"order": "1번타자", "avg": "0.305"},
    "페라자": {"order": "2번타자", "avg": "0.324"},
    "노시환": {"order": "3번타자", "avg": "0.312"},
    "채은성": {"order": "4번타자", "avg": "0.288"},
    "안치홍": {"order": "5번타자", "avg": "0.295"},
    "김태연": {"order": "6번타자", "avg": "0.283"},
    "최인호": {"order": "7번타자", "avg": "0.274"},
    "최재훈": {"order": "8번타자", "avg": "0.268"},
    "장진혁": {"order": "9번타자", "avg": "0.268"},
    "문현빈": {"order": "1번타자", "avg": "0.312"},
    "이재원": {"order": "8번타자", "avg": "0.261"},

    # 롯데 자이언츠
    "황성빈": {"order": "1번타자", "avg": "0.320"},
    "윤동희": {"order": "2번타자", "avg": "0.293"},
    "레이예스": {"order": "3번타자", "avg": "0.352"},
    "전준우": {"order": "4번타자", "avg": "0.310"},
    "나승엽": {"order": "5번타자", "avg": "0.281"},
    "손성빈": {"order": "6번타자", "avg": "0.254"},
    "정훈": {"order": "7번타자", "avg": "0.278"},
    "노진혁": {"order": "8번타자", "avg": "0.265"},
    "박승욱": {"order": "9번타자", "avg": "0.271"}
}

CRISIS_TYPES = [
    {
        "id": "DEFENSIVE_CRISIS",
        "title": "🚨 수비 위기 상황 발생!",
        "desc": "{inning} 주자 득점권 진출!",
        "options": [
            {"id": "PITCHER_CHANGE", "name": "투수 교체한다", "risk": "교체", "desc": ""},
            {"id": "STAY_WITH_PITCHER", "name": "믿고 그대로 간다", "risk": "신뢰", "desc": ""}
        ]
    },
    {
        "id": "OFFENSIVE_CHANCE",
        "title": "🔥 공격 득점권 찬스 발생!",
        "desc": "{inning} {team} 2,3루 득점권 절호의 찬스! 타석엔 {batter}.",
        "options": [
            {"id": "PINCH_HITTER", "name": "대타를 사용한다", "risk": "대타", "desc": ""},
            {"id": "PINCH_RUNNER", "name": "대주자를 사용한다", "risk": "대주자", "desc": ""}
        ]
    },
    {
        "id": "CLOSE_GAME_TACTIC",
        "title": "⚡ 승부처 작전 지시 타이밍!",
        "desc": "{inning} 무사 1,2루 접전 승부처! 경기 향방을 가를 작전 선택.",
        "options": [
            {"id": "SACRIFICE_BUNT", "name": "번트 작전을 낸다", "risk": "번트", "desc": ""},
            {"id": "FULL_SWING", "name": "강공시킨다", "risk": "강공", "desc": ""}
        ]
    }
]

class GameEngine:
    def __init__(self, home_team="삼성", away_team="한화", home_pitcher=None, away_pitcher=None, user_id=None):
        self.user_id = user_id  # 이 경기를 보는 사용자 (점수 저장 대상)
        if home_team == away_team:
            away_team = "한화" if home_team != "한화" else "삼성"
        self.home_team_name = home_team
        self.away_team_name = away_team
        self.home_pitcher = home_pitcher or TEAMS.get(home_team, {}).get("pitcher", "페덱")
        self.away_pitcher = away_pitcher or TEAMS.get(away_team, {}).get("pitcher", "박준영")
        self.reset()

    def reset(self, home_pitcher=None, away_pitcher=None):
        if self.home_team_name == self.away_team_name:
            self.away_team_name = "한화" if self.home_team_name != "한화" else "삼성"
        if home_pitcher:
            self.home_pitcher = home_pitcher
        elif not getattr(self, 'home_pitcher', None):
            self.home_pitcher = TEAMS.get(self.home_team_name, {}).get("pitcher", "페덱")

        if away_pitcher:
            self.away_pitcher = away_pitcher
        elif not getattr(self, 'away_pitcher', None):
            self.away_pitcher = TEAMS.get(self.away_team_name, {}).get("pitcher", "박준영")

        self.inning = 1
        self.is_top = True
        self.score_home = 0
        self.score_away = 0
        self.outs = 0
        self.balls = 0
        self.strikes = 0
        self.runner_1b = False
        self.runner_2b = False
        self.runner_3b = False
        
        # 유저 기존 스코어 승계 (없으면 2,000pt부터 시작)
        user = database.get_user_by_id(self.user_id) if getattr(self, 'user_id', None) else None
        self.manager_score = user["score"] if (user and "score" in user and user["score"] is not None) else 2000
        self._update_manager_grade()

        self.currentBatterPitchCount = 0
        self.totalPitcherCount = 0
        self.consecutive_hits = 0
        self.consecutive_on_base = 0
        self.pitch_counts = {}      # 투수별 투구수
        self.outing_runs = {}       # 투수별 실점
        self.used_pitchers = {self.home_team_name: {self.home_pitcher}, self.away_team_name: {self.away_pitcher}}
        self.crisis_seen = set()    # (이닝, 초/말, 투수): 같은 투수에게 한 이닝에 위기 한 번만
        self.runner_names = {1: None, 2: None, 3: None}
        
        self.current_crisis = None
        self.crisis_active = False
        self.pending_tactic = None
        self.last_tactic_resolution = None
        self.has_crisis_popped_for_current_batter = False
        self.game_over = False
        self.commentary_logs = ["⚾ [경기 개시] 1회초 경기가 시작되었습니다! 두 팀 선수들이 그라운드에 입장합니다."]
        self.pitch_history = []
        self.batter_sessions = []
        self.in_game_batter_stats = {}
        
        self.batter_index_home = 0
        self.batter_index_away = 0
        
        self.last_win_prob = 50.0
        self.init_first_session()

    def get_batter_in_game_stats(self, batter_name):
        if batter_name not in self.in_game_batter_stats:
            b_info = {"order": "타자", "avg": f"{self._batter_rating(batter_name)['avg']:.3f}"}
            order = b_info.get("order", "타자")
            # 타순은 최신 라인업 기준
            for t in (self.get_current_offense_team(), self.home_team_name, self.away_team_name):
                batters = TEAMS.get(t, {}).get("batters", [])
                if batter_name in batters:
                    order = f"{batters.index(batter_name) + 1}번타자"
                    break
            self.in_game_batter_stats[batter_name] = {
                "order": order,
                "avg": b_info.get("avg", "0.285"),
                "tasuk": 0,
                "tasu": 0,
                "anta": 0,
                "deukjeom": 0,
                "tajeom": 0,
                "homerun": 0,
                "bolnet": 0,
                "samjin": 0
            }
        return self.in_game_batter_stats[batter_name]

    def get_win_probability(self):
        base = 50.0
        diff = (self.score_home - self.score_away) if not self.is_top else (self.score_away - self.score_home)
        prob = base + (diff * 7.5)
        if self.runner_2b or self.runner_3b:
            prob += 4.2
        if self.runner_1b:
            prob += 1.8
        prob -= (self.outs * 2.0)
        return round(max(5.0, min(95.0, prob)), 1)

    def init_first_session(self):
        self.currentBatterPitchCount = 0
        self.has_crisis_popped_for_current_batter = False
        if not self.batter_sessions:
            self.runner_1b = False
            self.runner_2b = False
            self.runner_3b = False
        batter = self.get_current_batter()
        offense = self.get_current_offense_team()
        b_stats = self.get_batter_in_game_stats(batter)
        
        session = {
            "session_id": len(self.batter_sessions) + 1,
            "inning": self.inning,
            "is_top": self.is_top,
            "inning_str": f"{self.inning}회{'초' if self.is_top else '말'}",
            "offense_team": offense,
            "batter_name": batter,
            "batter_order": b_stats["order"],
            "batter_avg": b_stats["avg"],
            "batter_stats": dict(b_stats),
            "play_summary": "",
            "win_prob": self.get_win_probability(),
            "win_prob_delta": 0.0,
            "pitches": []
        }
        self.batter_sessions.insert(0, session)

    def get_current_offense_team(self):
        return self.away_team_name if self.is_top else self.home_team_name

    def get_current_defense_team(self):
        return self.home_team_name if self.is_top else self.away_team_name

    def get_current_batter(self):
        team = TEAMS.get(self.get_current_offense_team(), TEAMS["한화"])
        idx = self.batter_index_away if self.is_top else self.batter_index_home
        return team["batters"][idx % len(team["batters"])]

    def get_current_pitcher(self):
        if self.is_top:
            return getattr(self, 'home_pitcher', None) or TEAMS.get(self.home_team_name, {}).get('pitcher', '페덱')
        else:
            return getattr(self, 'away_pitcher', None) or TEAMS.get(self.away_team_name, {}).get('pitcher', '박준영')

    def _make_pitch_obj(self, seq, code, res_text, pitch_desc, sb_count_str, commentary_text):
        if code in ["STRIKE", "FOUL", "SINGLE", "DOUBLE", "TRIPLE", "HOMERUN", "OUT"]:
            pz_x = round(random.uniform(-0.65, 0.65), 2)
            pz_y = round(random.uniform(-0.65, 0.65), 2)
            is_strike = True
        else:
            is_strike = False
            side = random.choice(["top", "bottom", "left", "right"])
            if side == "top":
                pz_x = round(random.uniform(-0.7, 0.7), 2)
                pz_y = round(random.uniform(-1.45, -1.1), 2)
            elif side == "bottom":
                pz_x = round(random.uniform(-0.7, 0.7), 2)
                pz_y = round(random.uniform(1.1, 1.45), 2)
            elif side == "left":
                pz_x = round(random.uniform(-1.45, -1.1), 2)
                pz_y = round(random.uniform(-0.7, 0.7), 2)
            else:
                pz_x = round(random.uniform(1.1, 1.45), 2)
                pz_y = round(random.uniform(-0.7, 0.7), 2)
        return {
            "seq": seq,
            "currentBatterPitchCount": self.currentBatterPitchCount,
            "totalPitcherCount": self.totalPitcherCount,
            "result": res_text,
            "speed_type": pitch_desc,
            "count": sb_count_str,
            "code": code,
            "pz_x": pz_x,
            "pz_y": pz_y,
            "is_strike": is_strike,
            "commentary_text": commentary_text
        }

    # ------------------------------------------------------------------
    # 가상 경기 시뮬레이션
    # - 선수마다 이름으로 고정된 가상 능력치(타율·장타력 / 제구·구위·체력)
    # - 투수는 투구수가 체력을 넘으면 지치고(볼·피안타 증가), 투구수는 투수별로 셈
    # - '실제 감독'(AI)은 투구수·실점·연속 출루·경기 후반 접전 여부로 교체를 판단
    # ------------------------------------------------------------------
    def _pitcher_role(self, name, team=None):
        r = TEAMS.get(team or self.get_current_defense_team(), {}).get("roster") or {}
        if any(p["name"] == name for p in r.get("rotation", [])):
            return "starter"
        if r.get("closer") == name:
            return "closer"
        return "reliever"

    def _pitcher_rating(self, name):
        q = _seed(name, "pit")
        role = self._pitcher_role(name)
        stamina = (84 + int(q * 20)) if role == "starter" else (18 + int(q * 14))
        control = 0.315 + (1 - q) * 0.06
        return {"q": q, "stamina": stamina, "control": control, "role": role}

    def _batter_rating(self, name):
        sess_order = 5
        batters = TEAMS.get(self.get_current_offense_team(), {}).get("batters", [])
        if name in batters:
            sess_order = batters.index(name)
        avg = 0.235 + _seed(name, "avg") * 0.09 + (0.01 if sess_order <= 1 else 0)
        power = (0.45 + _seed(name, "pow") * 0.55) if 2 <= sess_order <= 4 else (0.12 + _seed(name, "pow") * 0.5)
        return {"avg": avg, "power": power}

    def _fatigue(self, pitcher):
        rt = self._pitcher_rating(pitcher)
        pc = self.pitch_counts.get(pitcher, 0)
        return max(0.0, min(1.5, (pc - rt["stamina"]) / 25.0)), rt

    def _pitch_desc(self, pitcher):
        f, rt = self._fatigue(pitcher)
        kinds = [("직구", 0), ("투심", -5), ("슬라이더", -12), ("체인지업", -17), ("커브", -24), ("포크볼", -14)]
        name, off = random.choice(kinds)
        top = 144 + int(rt["q"] * 10) - int(f * 3)
        return f"{top + off + random.randint(-2, 1)}km/h {name}"

    def _simulate_pitch(self, batter, pitcher):
        """한 구의 결과: BALL / STRIKE / FOUL / INPLAY"""
        f, rt = self._fatigue(pitcher)
        ball_p = min(0.5, rt["control"] + 0.045 * f)
        if self.balls == 3:
            ball_p -= 0.06
        if self.strikes == 2 and self.balls < 2:
            ball_p += 0.04
        if random.random() < ball_p:
            return "BALL"
        strike_p = 0.285 - 0.05 * f + (rt["q"] - 0.5) * 0.06
        foul_p = 0.41 + (0.06 if self.strikes == 2 else 0)
        r = random.random()
        if r < strike_p:
            return "STRIKE"
        if r < strike_p + foul_p:
            return "FOUL"
        return "INPLAY"

    def _simulate_in_play(self, batter, pitcher):
        f, rt = self._fatigue(pitcher)
        br = self._batter_rating(batter)
        hit_p = 0.335 + (br["avg"] - 0.27) * 1.3 + 0.07 * f - (rt["q"] - 0.5) * 0.07
        if random.random() < hit_p:
            hr = 0.045 + br["power"] * 0.12
            triple = 0.02
            double = 0.15 + br["power"] * 0.08
            r = random.random()
            if r < hr:
                return "HOMERUN"
            if r < hr + triple:
                return "TRIPLE"
            if r < hr + triple + double:
                return "DOUBLE"
            return "SINGLE"
        r = random.random()
        return "GROUND" if r < 0.46 else ("FLY" if r < 0.84 else "LINE")

    # 주자 이동 (이름과 함께). 반환: 이번 플레이로 들어온 점수
    def _bases(self):
        names = getattr(self, 'runner_names', None) or {1: None, 2: None, 3: None}
        return {1: names.get(1) if self.runner_1b else None,
                2: names.get(2) if self.runner_2b else None,
                3: names.get(3) if self.runner_3b else None}

    def _set_bases(self, b):
        self.runner_names = {1: b[1], 2: b[2], 3: b[3]}
        self.runner_1b, self.runner_2b, self.runner_3b = bool(b[1]), bool(b[2]), bool(b[3])

    def _move_runners(self, kind, batter):
        b = self._bases()
        runs = 0
        two_out = self.outs >= 2
        if kind == "WALK":
            if b[1]:
                if b[2]:
                    if b[3]:
                        runs += 1
                    b[3] = b[2]
                b[2] = b[1]
            b[1] = batter
        elif kind == "SINGLE":
            if b[3]:
                runs += 1
                b[3] = None
            if b[2]:
                if random.random() < (0.8 if two_out else 0.6):
                    runs += 1
                else:
                    b[3] = b[2]
                b[2] = None
            if b[1]:
                if not b[3] and random.random() < 0.25:
                    b[3] = b[1]
                else:
                    b[2] = b[1]
            b[1] = batter
        elif kind == "DOUBLE":
            runs += (1 if b[3] else 0) + (1 if b[2] else 0)
            first = b[1]
            b = {1: None, 2: batter, 3: None}
            if first:
                if random.random() < (0.65 if two_out else 0.45):
                    runs += 1
                else:
                    b[3] = first
        elif kind == "TRIPLE":
            runs += sum(1 for k in (1, 2, 3) if b[k])
            b = {1: None, 2: None, 3: batter}
        elif kind == "HOMERUN":
            runs += 1 + sum(1 for k in (1, 2, 3) if b[k])
            b = {1: None, 2: None, 3: None}
        self._set_bases(b)
        return runs

    def _play_out(self, kind, batter):
        """아웃 플레이: (늘어난 아웃 수, 점수, 결과 문구)"""
        b = self._bases()
        pos = random.choice(["유격수", "2루수", "3루수", "1루수"])
        of = random.choice(["좌익수", "중견수", "우익수"])
        if kind == "GROUND":
            if b[1] and self.outs < 2 and random.random() < 0.45:
                outs = 2
                runs = 0
                if self.outs + outs < 3:
                    if b[3]:
                        runs += 1
                    b = {1: None, 2: None, 3: b[2]}
                self._set_bases(b)
                return outs, runs, f"{pos} 앞 병살타"
            runs = 0
            if self.outs + 1 < 3:
                if b[3] and (b[2] and b[1]):
                    runs += 1
                    b[3] = None
                elif b[3] and random.random() < 0.4:
                    runs += 1
                    b[3] = None
                if b[2] and not b[3]:
                    b[3], b[2] = b[2], None
                if b[1]:
                    if b[2]:
                        b[3] = b[3] or b[2]
                    b[2], b[1] = b[1], None
            self._set_bases(b)
            return 1, runs, f"{pos} 땅볼 아웃"
        if kind == "FLY":
            if b[3] and self.outs < 2 and random.random() < 0.6:
                b[3] = None
                self._set_bases(b)
                return 1, 1, f"{of} 희생플라이 아웃 (1타점)"
            if b[2] and not b[3] and self.outs < 2 and random.random() < 0.3:
                b[3], b[2] = b[2], None
                self._set_bases(b)
            return 1, 0, f"{of} 뜬공 아웃"
        return 1, 0, f"{pos} 직선타 아웃"

    def step_pitch(self):
        """1구 단위 경기 진행 및 KBO 규정 경기 종료/연장전 반영"""
        if self.game_over:
            return self.get_state()

        if self.crisis_active and self.current_crisis:
            return self.get_state()

        self.last_tactic_resolution = None
        if not self.batter_sessions:
            self.init_first_session()

        batter = self.get_current_batter()
        pitcher = self.get_current_pitcher()
        inning_str = f"{self.inning}회{'초' if self.is_top else '말'}"
        curr_session = self.batter_sessions[0]

        self.pitch_counts[pitcher] = self.pitch_counts.get(pitcher, 0) + 1
        self.totalPitcherCount = self.pitch_counts[pitcher]
        self.currentBatterPitchCount += 1
        seq = self.currentBatterPitchCount
        pitch_desc = self._pitch_desc(pitcher)
        head = f"[{inning_str}] {pitcher} 투수 (vs {batter} 타자), {seq}구 {pitch_desc}"

        res = self._simulate_pitch(batter, pitcher)
        pa_end = None      # 타석이 끝났으면 결과 종류
        code, res_text = res, ""
        summary_text = ""
        runs = 0
        outs_added = 0

        if res == "BALL":
            self.balls += 1
            res_text = "볼"
            if self.balls >= 4:
                pa_end = "WALK"
                res_text = "볼넷 출루"
                runs = self._move_runners("WALK", batter)
                summary_text = f"{batter} : {'밀어내기 볼넷 (1타점)' if runs else '볼넷 출루'}"
        elif res == "STRIKE":
            self.strikes += 1
            res_text = "스트라이크"
            if self.strikes >= 3:
                pa_end = "K"
                code, res_text = "OUT", "삼진 아웃"
                outs_added = 1
                summary_text = f"{batter} : {random.choice(['헛스윙', '루킹'])} 삼진 아웃"
        elif res == "FOUL":
            if self.strikes < 2:
                self.strikes += 1
            res_text = "파울"
        else:
            kind = self._simulate_in_play(batter, pitcher)
            if kind in ("SINGLE", "DOUBLE", "TRIPLE", "HOMERUN"):
                pa_end = kind
                code = kind
                runs = self._move_runners(kind, batter)
                rbi = f" ({runs}타점)" if runs and kind != "HOMERUN" else ""
                if kind == "SINGLE":
                    res_text = "타격 (안타)"
                    summary_text = f"{batter} : {random.choice(['좌전', '중전', '우전'])} 안타{rbi}"
                elif kind == "DOUBLE":
                    res_text = "타격 (2루타)"
                    summary_text = f"{batter} : {random.choice(['좌중간', '우중간', '좌익선상'])} 2루타{rbi}"
                elif kind == "TRIPLE":
                    res_text = "타격 (3루타)"
                    summary_text = f"{batter} : 우중간 3루타{rbi}"
                else:
                    res_text = "타격 (홈런)"
                    summary_text = f"{batter} : 비거리 {random.randint(108, 135)}m {runs}점 홈런!"
            else:
                pa_end = "OUT"
                code = "OUT"
                outs_added, runs, desc = self._play_out(kind, batter)
                res_text = "아웃"
                summary_text = f"{batter} : {desc}"

        sb_count_str = f"S-B: {self.strikes}-{self.balls}"
        commentary_text = f"{head} - {summary_text.split(' : ', 1)[1] if summary_text else res_text}"
        curr_session["pitches"].append(self._make_pitch_obj(seq, code, res_text, pitch_desc, sb_count_str, commentary_text))
        self.commentary_logs.insert(0, f"⚾ {commentary_text}")
        del self.commentary_logs[60:]

        if pa_end:
            self.outs += outs_added
            # 세 번째 아웃과 동시에 들어온 점수는 인정하지 않음 (병살·땅볼)
            if runs and self.outs >= 3 and pa_end == "OUT":
                runs = 0
            if runs:
                if self.is_top:
                    self.score_away += runs
                else:
                    self.score_home += runs
                self.outing_runs[pitcher] = self.outing_runs.get(pitcher, 0) + runs
            if pa_end in ("WALK", "SINGLE", "DOUBLE", "TRIPLE", "HOMERUN"):
                self.consecutive_on_base += 1
                self.consecutive_hits += 0 if pa_end == "WALK" else 1
            else:
                self.consecutive_on_base = 0
                self.consecutive_hits = 0
            self.strikes = 0
            self.balls = 0
            self._finish_plate_appearance(batter, pa_end, runs, summary_text, curr_session)
            if self.game_over:
                return self.get_state()
        elif self._check_walk_off_win():
            return self.get_state()

        self._check_crisis()
        return self.get_state()

    def _finish_plate_appearance(self, batter, pa_end, runs, summary_text, curr_session):
        b_stats = self.get_batter_in_game_stats(batter)
        b_stats["tasuk"] += 1
        if pa_end == "WALK":
            b_stats["bolnet"] += 1
        else:
            b_stats["tasu"] += 1
        if pa_end == "K":
            b_stats["samjin"] += 1
        if pa_end in ("SINGLE", "DOUBLE", "TRIPLE", "HOMERUN"):
            b_stats["anta"] += 1
        if pa_end == "HOMERUN":
            b_stats["homerun"] += 1
            b_stats["deukjeom"] += 1
        b_stats["tajeom"] += runs
        curr_session["batter_stats"] = dict(b_stats)

        if not self.is_top and self.inning >= 9 and self.score_home > self.score_away and runs:
            summary_text = summary_text.replace(" : ", " : 끝내기 ", 1)
        new_win_prob = self.get_win_probability()
        curr_session["win_prob_delta"] = round(new_win_prob - curr_session["win_prob"], 1)
        curr_session["win_prob"] = new_win_prob
        curr_session["play_summary"] = summary_text

        if getattr(self, 'pending_tactic', None):
            self._score_tactic("OUT" if pa_end in ("K", "OUT") else "NOT_OUT")

        if self._check_walk_off_win():
            return
        self._next_batter()
        self._check_half_inning_transition()
        if not self.game_over:
            self._maybe_auto_change()
            self.init_first_session()

    # 위기 작전 채점: 내 선택 × 실제 감독(AI) 선택 × 다음 타석 결과(아웃/출루)
    TACTIC_CASES = {
        ("CHANGE", "CHANGE", "OUT"): (1, 10, "동일 선택 & 방어 성공!", "나와 감독 모두 교체, 타자를 잡아냈어요"),
        ("CHANGE", "CHANGE", "NOT_OUT"): (2, -10, "동일 선택 & 출루 허용", "나와 감독 모두 교체했지만 출루를 허용했어요"),
        ("CHANGE", "KEEP", "OUT"): (3, -15, "감독 판단 적중", "감독은 유지, 기존 투수가 타자를 잡았어요"),
        ("CHANGE", "KEEP", "NOT_OUT"): (4, 15, "통찰력 적중!", "감독은 유지했지만 출루 허용, 내 교체 판단이 옳았어요"),
        ("KEEP", "CHANGE", "OUT"): (5, -15, "감독 교체 적중", "감독의 투수 교체가 아웃을 잡았어요"),
        ("KEEP", "CHANGE", "NOT_OUT"): (6, 15, "통찰력 적중!", "감독의 구원 투수가 출루 허용, 내 유지 판단이 옳았어요"),
        ("KEEP", "KEEP", "OUT"): (7, 10, "동일 선택 & 믿음 성공!", "나와 감독 모두 유지, 투수가 타자를 잡았어요"),
        ("KEEP", "KEEP", "NOT_OUT"): (8, -10, "동일 선택 & 출루 허용", "나와 감독 모두 유지했지만 출루를 허용했어요"),
    }

    def _score_tactic(self, actual_result):
        my = self.pending_tactic["my_choice"]
        mgr = self.pending_tactic["actual_manager_choice"]
        if my == "SKIP":
            self.last_tactic_resolution = {
                "case_no": 0, "my_choice": "SKIP", "actual_manager_choice": mgr,
                "actual_result": actual_result, "my_choice_label": "자리 비움",
                "mgr_choice_label": "교체" if mgr == "CHANGE" else "유지",
                "actual_result_label": "아웃" if actual_result == "OUT" else "출루",
                "score_delta": 0, "total_score": self.manager_score, "grade": self.manager_grade,
                "title": "감독님 자리 비움", "commentary": "작전을 고르지 않아 점수 변동이 없어요", "skipped": True
            }
            self.commentary_logs.insert(0, "🚻 [자리 비움] 작전을 고르지 않아 점수 변동 없음")
            self.pending_tactic = None
            return
        case_no, score_delta, title, commentary = self.TACTIC_CASES[(my, mgr, actual_result)]
        self.manager_score += score_delta
        self._update_manager_grade()
        if getattr(self, 'user_id', None):
            try:
                database.update_user_score(self.manager_score, self.manager_grade, self.user_id)
                database.log_tactic(self.pending_tactic["inning_str"], self.pending_tactic["situation_title"],
                                    f"CASE_{case_no}", score_delta, self.manager_grade, commentary, self.user_id)
            except Exception as e:
                print(f"⚠️ [작전 기록 저장 실패] {e}")
        self.commentary_logs.insert(0, f"📊 [위기 채점 {case_no}번] {commentary} ({score_delta:+d})")
        self.last_tactic_resolution = {
            "case_no": case_no,
            "my_choice": my,
            "actual_manager_choice": mgr,
            "actual_result": actual_result,
            "my_choice_label": "교체" if my == "CHANGE" else "유지",
            "mgr_choice_label": "교체" if mgr == "CHANGE" else "유지",
            "actual_result_label": "아웃" if actual_result == "OUT" else "출루",
            "score_delta": score_delta,
            "total_score": self.manager_score,
            "grade": self.manager_grade,
            "title": title,
            "commentary": commentary
        }
        self.pending_tactic = None

    def _check_crisis(self):
        if self.game_over or self.pending_tactic or self.crisis_active:
            return
        if getattr(self, 'has_crisis_popped_for_current_batter', False):
            return
        crisis = self.check_crisis_trigger()
        if crisis:
            self.crisis_active = True
            self.current_crisis = crisis
            self.has_crisis_popped_for_current_batter = True
            self.crisis_seen.add((self.inning, self.is_top, crisis["pitcher_name"]))
            self.commentary_logs.insert(0, f"🚨 [위기] {crisis['desc']}")

    def _check_walk_off_win(self):
        """9회말 이상 말 공격 중 홈팀 리드 시 끝내기 경기 종료"""
        if not self.is_top and self.inning >= 9:
            if self.score_home > self.score_away:
                self.game_over = True
                curr_session = self.batter_sessions[0] if self.batter_sessions else None
                if curr_session and not curr_session.get("play_summary"):
                    curr_session["play_summary"] = f"{self.get_current_batter()} : 끝내기 득점 승리!"
                winner_msg = f"🚀 [끝내기 경기 종료 (Final)] {self.home_team_name}이(가) {self.inning}회말 끝내기 득점으로 승리를 확정지었습니다! (최종 스코어 {self.away_team_name} {self.score_away} : {self.score_home} {self.home_team_name})"
                if not self.commentary_logs or winner_msg not in self.commentary_logs[0]:
                    self.commentary_logs.insert(0, winner_msg)
                return True
        return False

    def _check_half_inning_transition(self):
        if self.outs >= 3:
            inning_str = f"{self.inning}회{'초' if self.is_top else '말'}"
            self.commentary_logs.insert(0, f"🔔 [{inning_str} 종료] 공수 교대됩니다.")
            self.outs = 0
            self.balls = 0
            self.strikes = 0
            self.runner_1b = False
            self.runner_2b = False
            self.runner_3b = False
            self.runner_names = {1: None, 2: None, 3: None}
            self.currentBatterPitchCount = 0
            self.consecutive_hits = 0
            self.consecutive_on_base = 0

            # 1. 9회초 이상 종료 시 (Top of Inning 9+)
            if self.is_top and self.inning >= 9:
                if self.score_home > self.score_away:
                    # 홈팀(후공)이 리드 중 -> 9회말 진행 없이 즉시 경기 종료
                    self.game_over = True
                    self.commentary_logs.insert(0, f"🏁 [경기 종료 (Final)] {self.inning}회초 종료! {self.home_team_name}이(가) {self.score_home}:{self.score_away}로 리드함에 따라 {self.inning}회말 진행 없이 {self.home_team_name} 승리로 경기가 종료되었습니다.")
                    return
                else:
                    # 원정팀 리드 또는 동점 -> 9회말 공격으로 진행
                    self.is_top = False
                    return

            # 2. 9회말 이상 종료 시 (Bottom of Inning 9+)
            if not self.is_top and self.inning >= 9:
                if self.score_home != self.score_away:
                    # 승패 판정 -> 경기 종료
                    self.game_over = True
                    winner = self.home_team_name if self.score_home > self.score_away else self.away_team_name
                    self.commentary_logs.insert(0, f"🏁 [경기 종료 (Final)] {self.inning}회말 정규/연장 이닝 완료! {winner} 승리로 경기가 최종 종료되었습니다. (최종 스코어 {self.away_team_name} {self.score_away} : {self.score_home} {self.home_team_name})")
                    return
                else:
                    # 동점(Tie)일 경우 연장전 규칙 적용 (최대 11회말까지)
                    if self.inning < 11:
                        self.inning += 1
                        self.is_top = True
                        self.commentary_logs.insert(0, f"⚔️ [연장전 진입] {self.inning - 1}회말 종료 결과 양팀 {self.score_home}:{self.score_away} 동점으로 연장 {self.inning}회초에 진입합니다!")
                        return
                    else:
                        # 11회말 종료 시까지 동점 -> 무승부 경기 종료
                        self.game_over = True
                        self.commentary_logs.insert(0, f"🤝 [경기 종료 (Final)] 연장 11회말까지 양팀 {self.score_home}:{self.score_away} 무승부로 경기가 최종 종료되었습니다.")
                        return

            # 일반 이닝 교대 (1회초~8회말)
            if not self.is_top:
                self.inning += 1
            self.is_top = not self.is_top

    def check_crisis_trigger(self):
        """[위기 감지]
        선발투수: 70구 이상 + 득점권 주자면 타자마다(조건 B), 70구 미만 + 4타자 이상 연속 출루면 타자마다(조건 A)
        구원투수: 투구수와 상관없이 점수 차 3점 이내 + 득점권 주자면 타자마다(조건 R)
        """
        if self.outs >= 3 or self.game_over:
            return None
        pitcher = self.get_current_pitcher()
        p_count = self.pitch_counts.get(pitcher, 0)
        risp = self.runner_2b or self.runner_3b
        on_base_4 = self.consecutive_on_base >= 4

        if self._pitcher_role(pitcher) == "starter":
            # 70구 이상: 득점권이면 타자마다 / 70구 미만: 4타자 이상 연속 출루가 이어지는 동안 타자마다
            is_cond_b = (p_count >= 70) and risp
            is_cond_a = (p_count < 70) and on_base_4
        else:
            # 구원투수: 점수 차 3점 이내 접전 + 득점권이면 타자를 상대할 때마다 (같은 타자에게는 한 번)
            is_cond_b = risp and abs(self.score_home - self.score_away) <= 3
            is_cond_a = False
        if not (is_cond_a or is_cond_b):
            return None

        inning_str = f"{self.inning}회{'초' if self.is_top else '말'}"
        batter = self.get_current_batter()
        if is_cond_a:
            condition_type = "CONDITION_A"
            condition_label = "조건 A: 70구 미만 4타자 연속 출루 위기"
            reason_str = "4타자 연속 출루"
        elif self._pitcher_role(pitcher) == "starter":
            condition_type = "CONDITION_B"
            condition_label = "조건 B: 70구 이상 득점권 실점 위기"
            reason_str = "득점권 주자"
        else:
            condition_type = "CONDITION_R"
            condition_label = "구원 투수 접전 득점권 위기"
            reason_str = "득점권 주자"

        return {
            "id": "PITCHER_CHANGE_CRISIS",
            "condition_type": condition_type,
            "condition_label": condition_label,
            "title": "투수를 바꿀까요?",
            "desc": f"{inning_str} · {reason_str} · {pitcher} {p_count}구 · 다음 타자 {batter}",
            "pitcher_name": pitcher,
            "pitch_count": p_count,
            "consecutive_on_base": self.consecutive_on_base,
            "runner_2b": self.runner_2b,
            "runner_3b": self.runner_3b,
            "options": [
                {"id": "PITCHER_CHANGE", "name": "투수 교체", "risk": "교체", "desc": "불펜 투입"},
                {"id": "KEEP_PITCHER", "name": "그대로 간다", "risk": "유지", "desc": "지금 투수 유지"}
            ]
        }

    def manager_change_probability(self):
        """'실제 감독'(AI)이 지금 투수를 바꿀 확률.
        지칠수록·실점이 많을수록·연속 출루가 길수록·경기 후반 접전일수록 높아지고,
        막 올라온 투수는 잘 안 바꿈"""
        pitcher = self.get_current_pitcher()
        f, rt = self._fatigue(pitcher)
        pc = self.pitch_counts.get(pitcher, 0)
        p = 0.12
        if pc >= rt["stamina"] - 15:
            p += 0.25
        p += 0.35 * min(1.0, f)
        runs = self.outing_runs.get(pitcher, 0)
        p += 0.12 if runs >= 3 else 0
        p += 0.15 if runs >= 5 else 0
        p += 0.12 if self.consecutive_on_base >= 3 else 0
        if self.inning >= 7 and abs(self.score_home - self.score_away) <= 3:
            p += 0.12
        if rt["role"] != "starter" and pc < 15:
            p -= 0.25
        if rt["role"] == "closer":
            p -= 0.15
        return max(0.05, min(0.92, p))

    def _pick_reliever(self, team, save_situation=False):
        r = TEAMS.get(team, {}).get("roster") or {}
        used = self.used_pitchers.setdefault(team, set())
        closer = r.get("closer")
        if save_situation and closer and closer not in used:
            return closer
        pool = [p["name"] for p in r.get("bullpen", []) if p["name"] not in used and p["name"] != closer]
        if pool:
            return random.choice(pool)
        if closer and closer not in used:
            return closer
        return None

    def _change_pitcher(self, new_pitcher, reason=""):
        old = self.get_current_pitcher()
        team = self.get_current_defense_team()
        self.used_pitchers.setdefault(team, set()).add(new_pitcher)
        if self.is_top:
            self.home_pitcher = new_pitcher
        else:
            self.away_pitcher = new_pitcher
        self.consecutive_on_base = 0
        self.commentary_logs.insert(0, f"🔄 [투수 교체] {team}: {old} → {new_pitcher}{(' (' + reason + ')') if reason else ''}")
        return old

    def _maybe_auto_change(self):
        """위기 팝업과 별개로, 감독이 알아서 하는 교체 (지친 투수·대량 실점·세이브 상황 마무리)"""
        if self.game_over or self.pending_tactic:
            return
        team = self.get_current_defense_team()
        pitcher = self.get_current_pitcher()
        f, rt = self._fatigue(pitcher)
        pc = self.pitch_counts.get(pitcher, 0)
        lead = (self.score_home - self.score_away) if self.is_top else (self.score_away - self.score_home)
        fresh_half = self.outs == 0 and not (self.runner_1b or self.runner_2b or self.runner_3b)

        if self.inning >= 9 and fresh_half and 1 <= lead <= 3 and rt["role"] != "closer":
            closer = (TEAMS.get(team, {}).get("roster") or {}).get("closer")
            if closer and closer not in self.used_pitchers.get(team, set()):
                self._change_pitcher(closer, "세이브 상황")
                return
        tired = pc >= rt["stamina"] + 8
        shelled = self.outing_runs.get(pitcher, 0) >= 6
        # 불펜 투수는 보통 한 이닝만: 새 이닝 시작 때 이미 10구 이상 던졌으면 교체
        reliever_done = fresh_half and rt["role"] == "reliever" and pc >= 10
        if tired or shelled or reliever_done or (fresh_half and pc >= rt["stamina"] - 5):
            new = self._pick_reliever(team)
            if new:
                self._change_pitcher(new, "체력 소진" if not shelled else "대량 실점")

    def apply_tactic(self, tactic_id):
        """[위기 작전] 내 선택을 받고, 실제 감독(AI)의 선택을 정해 다음 타석 결과로 채점 대기"""
        inning_str = f"{self.inning}회{'초' if self.is_top else '말'}"
        situation_title = "투수 교체 위기"
        old_pitcher = self.get_current_pitcher()

        # 시간 안에 고르지 않으면 '자리 비움'(SKIP): 감독은 그대로 판단하고, 내 점수는 변동 없음
        my_choice = {"PITCHER_CHANGE": "CHANGE", "KEEP_PITCHER": "KEEP"}.get(tactic_id, "SKIP")
        actual_manager_choice = "CHANGE" if random.random() < self.manager_change_probability() else "KEEP"

        new_pitcher = old_pitcher
        if actual_manager_choice == "CHANGE":
            team = self.get_current_defense_team()
            lead = (self.score_home - self.score_away) if self.is_top else (self.score_away - self.score_home)
            picked = self._pick_reliever(team, save_situation=(self.inning >= 9 and 1 <= lead <= 3))
            if picked:
                new_pitcher = picked
                self._change_pitcher(picked, "위기 교체")
            else:
                actual_manager_choice = "KEEP"

        # 투수 교체 여부는 화면에서 '작전 공개' 카드로 보여주므로, 투구 목록에는 넣지 않음
        if not self.batter_sessions:
            self.init_first_session()

        self.pending_tactic = {
            "my_choice": my_choice,
            "actual_manager_choice": actual_manager_choice,
            "old_pitcher": old_pitcher,
            "new_pitcher": new_pitcher,
            "inning_str": inning_str,
            "situation_title": situation_title
        }
        self.has_crisis_popped_for_current_batter = True
        self.crisis_active = False
        self.current_crisis = None

        my_label = {"CHANGE": "교체", "KEEP": "유지"}.get(my_choice, "자리 비움")
        log_msg = f"📋 [작전 제출] 나: {my_label} | 실제 감독: {'교체' if actual_manager_choice == 'CHANGE' else '유지'} (다음 타석 결과로 채점)"
        self.commentary_logs.insert(0, log_msg)

        return {
            "status": "success",
            "pending": True,
            "tactic_id": tactic_id,
            "my_choice": my_choice,
            "actual_manager_choice": actual_manager_choice,
            "old_pitcher": old_pitcher,
            "new_pitcher": new_pitcher,
            "commentary": log_msg,
            "state": self.get_state()
        }

    def _next_batter(self):
        self.currentBatterPitchCount = 0
        if self.is_top:
            self.batter_index_away += 1
        else:
            self.batter_index_home += 1

    def _update_manager_grade(self):
        s = self.manager_score
        if s >= 2150:
            self.manager_grade = "S"
        elif s >= 2050:
            self.manager_grade = "A"
        elif s >= 1950:
            self.manager_grade = "B"
        elif s >= 1850:
            self.manager_grade = "C"
        else:
            self.manager_grade = "F"

    def get_current_defense_fielders(self):
        def_team_name = self.get_current_defense_team()
        team = TEAMS.get(def_team_name, TEAMS["삼성"])
        fielders = team.get("fielders", [])
        curr_pitcher = self.get_current_pitcher()
        updated = []
        for f in fielders:
            item = dict(f)
            if item.get("role") == "P":
                item["name"] = curr_pitcher
            updated.append(item)
        return updated

    def get_on_deck_batters(self):
        team = TEAMS.get(self.get_current_offense_team(), TEAMS["한화"])
        batters = team.get("batters", ["황영묵", "페라자", "노시환", "채은성"])
        curr_idx = self.batter_index_away if self.is_top else self.batter_index_home
        on_deck = []
        for i in range(1, 4):
            nxt_idx = (curr_idx + i) % len(batters)
            b = batters[nxt_idx]
            b_name = b["name"] if isinstance(b, dict) else str(b)
            on_deck.append(f"{nxt_idx + 1}.{b_name}")
        return on_deck

    def _pitcher_throws(self, name):
        for t in (self.get_current_defense_team(),):
            r = TEAMS.get(t, {}).get("roster") or {}
            for p in r.get("rotation", []) + r.get("bullpen", []):
                if p["name"] == name:
                    return p.get("throws", "우투")
        return "우투"

    def get_batter_bats(self):
        name = self.get_current_batter()
        r = TEAMS.get(self.get_current_offense_team(), {}).get("roster") or {}
        return next((b.get("bats") for b in r.get("lineup", []) + r.get("bench", []) if b["name"] == name), "우타")

    def get_batter_side(self):
        """타자가 서는 타석: 'R'(우타석) 또는 'L'(좌타석). 양타는 투수 반대 손 쪽"""
        name = self.get_current_batter()
        r = TEAMS.get(self.get_current_offense_team(), {}).get("roster") or {}
        bats = next((b.get("bats") for b in r.get("lineup", []) + r.get("bench", []) if b["name"] == name), "우타")
        if bats == "좌타":
            return "L"
        if bats == "양타":
            return "R" if self._pitcher_throws(self.get_current_pitcher()).startswith("좌") else "L"
        return "R"

    def get_state(self):
        return {
            "inning": self.inning,
            "is_top": self.is_top,
            "inning_str": "경기 종료 (Final)" if self.game_over else f"{self.inning}회{'초' if self.is_top else '말'}",
            "home_team": self.home_team_name,
            "away_team": self.away_team_name,
            "home_pitcher": getattr(self, 'home_pitcher', '페덱'),
            "away_pitcher": getattr(self, 'away_pitcher', '박준영'),
            "home_logo": TEAMS.get(self.home_team_name, {}).get("logo", "⚾"),
            "away_logo": TEAMS.get(self.away_team_name, {}).get("logo", "⚾"),
            "score_home": self.score_home,
            "score_away": self.score_away,
            "outs": self.outs,
            "balls": self.balls,
            "strikes": self.strikes,
            "runner_1b": self.runner_1b,
            "runner_2b": self.runner_2b,
            "runner_3b": self.runner_3b,
            "runner_1b_name": (getattr(self, 'runner_names', {}) or {}).get(1) if self.runner_1b else None,
            "runner_2b_name": (getattr(self, 'runner_names', {}) or {}).get(2) if self.runner_2b else None,
            "runner_3b_name": (getattr(self, 'runner_names', {}) or {}).get(3) if self.runner_3b else None,
            "pitcher": self.get_current_pitcher(),
            "batter": self.get_current_batter(),
            "batter_side": self.get_batter_side(),
            "batter_bats": self.get_batter_bats(),
            "pitcher_throws": self._pitcher_throws(self.get_current_pitcher()),
            "on_deck_batters": self.get_on_deck_batters(),
            "fielders": self.get_current_defense_fielders(),
            "currentBatterPitchCount": self.currentBatterPitchCount,
            "totalPitcherCount": self.pitch_counts.get(self.get_current_pitcher(), 0),
            "pitch_count": self.pitch_counts.get(self.get_current_pitcher(), 0),
            "manager_score": self.manager_score,
            "manager_grade": self.manager_grade,
            "crisis_active": self.crisis_active,
            "current_crisis": self.current_crisis,
            "pending_tactic": getattr(self, 'pending_tactic', None),
            "tactic_resolution": getattr(self, 'last_tactic_resolution', None),
            "game_over": self.game_over,
            "win_prob": self.get_win_probability(),
            "current_batter_pitches": self.batter_sessions[0]["pitches"] if self.batter_sessions else [],
            "pitches": self.batter_sessions[0]["pitches"] if self.batter_sessions else [],
            "batter_sessions": self.batter_sessions[:30],
            "commentary_logs": self.commentary_logs[:15]
        }

