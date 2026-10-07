import random
import time
import database

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
    def __init__(self, home_team="삼성", away_team="한화", home_pitcher=None, away_pitcher=None):
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
        user = database.get_user_by_id(1)
        self.manager_score = user["score"] if (user and "score" in user and user["score"] is not None) else 2000
        self._update_manager_grade()

        self.currentBatterPitchCount = 0
        self.totalPitcherCount = 0
        self.consecutive_hits = 0
        self.consecutive_on_base = 0
        
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
            b_info = BATTER_STATS.get(batter_name, {"order": "타자", "avg": "0.285"})
            self.in_game_batter_stats[batter_name] = {
                "order": b_info.get("order", "타자"),
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
        if self.totalPitcherCount == 0 or (self.inning == 1 and self.is_top and len(self.batter_sessions) <= 1):
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
        if code in ["STRIKE", "FOUL", "SINGLE", "DOUBLE", "HOMERUN", "OUT"]:
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

    def step_pitch(self):
        """1구 단위 경기 진행 및 KBO 규정 경기 종료/연장전 반영"""
        if self.game_over:
            return self.get_state()

        if self.crisis_active and self.current_crisis:
            return self.get_state()

        self.last_tactic_resolution = None

        self.totalPitcherCount += 1
        self.currentBatterPitchCount += 1

        pitch_options = [
            ("직구", "148km/h"), ("슬라이더", "136km/h"), ("투심", "142km/h"), 
            ("체인지업", "131km/h"), ("커브", "125km/h"), ("포크볼", "134km/h")
        ]
        p_name, p_speed = random.choice(pitch_options)
        pitch_desc = f"{p_speed} {p_name}"

        # 야구 실제 타석 확률 반영: 스트라이크/볼/파울 비율 92%, 타격/아웃 8% -> 타석당 4~6구 유지
        outcomes = ["STRIKE", "BALL", "FOUL", "SINGLE", "DOUBLE", "HOMERUN", "OUT"]
        weights = [0.38, 0.38, 0.16, 0.03, 0.01, 0.005, 0.035]
        res = random.choices(outcomes, weights=weights)[0]

        batter = self.get_current_batter()
        pitcher = self.get_current_pitcher()
        inning_str = f"{self.inning}회{'초' if self.is_top else '말'}"

        if not self.batter_sessions:
            self.init_first_session()
        
        curr_session = self.batter_sessions[0]

        summary_text = ""
        is_turn_over = False
        at_bat_pitch_seq = self.currentBatterPitchCount

        if res == "STRIKE":
            self.strikes += 1
            res_text = "스트라이크"
            sb_count_str = f"S-B: {self.strikes}-{self.balls}"
            commentary_text = f"[{inning_str}] {pitcher} 투수 (vs {batter} 타자), {at_bat_pitch_seq}구 {pitch_desc} - {res_text}!"
            if self.strikes >= 3:
                self.outs += 1
                self.consecutive_on_base = 0
                summary_text = f"{batter} : 헛스윙 삼진 아웃"
                self.commentary_logs.insert(0, f"⚾ {commentary_text} ({batter} 삼진 아웃!)")
                is_turn_over = True
                curr_session["pitches"].append(self._make_pitch_obj(at_bat_pitch_seq, "OUT", "삼진 아웃", pitch_desc, sb_count_str, f"⚾ {commentary_text} ({batter} 삼진 아웃!)"))
                self.strikes = 0
                self.balls = 0
            else:
                self.commentary_logs.insert(0, f"⚾ {commentary_text} (카운트 {sb_count_str})")
                curr_session["pitches"].append(self._make_pitch_obj(at_bat_pitch_seq, "STRIKE", res_text, pitch_desc, sb_count_str, commentary_text))

        elif res == "BALL":
            self.balls += 1
            res_text = "볼"
            sb_count_str = f"S-B: {self.strikes}-{self.balls}"
            commentary_text = f"[{inning_str}] {pitcher} 투수 (vs {batter} 타자), {at_bat_pitch_seq}구 {pitch_desc} - {res_text}!"
            if self.balls >= 4:
                self.consecutive_on_base += 1
                summary_text = f"{batter} : 볼넷 출루"
                self.commentary_logs.insert(0, f"⚾ {commentary_text} ({batter} 볼넷 출루!)")
                self._advance_runners(1)
                is_turn_over = True
                curr_session["pitches"].append(self._make_pitch_obj(at_bat_pitch_seq, "BALL", "볼넷 출루", pitch_desc, sb_count_str, f"⚾ {commentary_text} ({batter} 볼넷 출루!)"))
                self.strikes = 0
                self.balls = 0
            else:
                self.commentary_logs.insert(0, f"⚾ {commentary_text} (카운트 {sb_count_str})")
                curr_session["pitches"].append(self._make_pitch_obj(at_bat_pitch_seq, "BALL", res_text, pitch_desc, sb_count_str, commentary_text))

        elif res == "FOUL":
            if self.strikes < 2:
                self.strikes += 1
            res_text = "파울"
            sb_count_str = f"S-B: {self.strikes}-{self.balls}"
            commentary_text = f"[{inning_str}] {pitcher} 투수 (vs {batter} 타자), {at_bat_pitch_seq}구 {pitch_desc} - {res_text}!"
            self.commentary_logs.insert(0, f"⚾ {commentary_text}")
            curr_session["pitches"].append(self._make_pitch_obj(at_bat_pitch_seq, "FOUL", res_text, pitch_desc, sb_count_str, commentary_text))

        elif res == "SINGLE":
            self.consecutive_hits += 1
            self.consecutive_on_base += 1
            res_text = "타격 (안타)"
            sb_count_str = f"S-B: {self.strikes}-{self.balls}"
            commentary_text = f"[{inning_str}] {pitcher} 투수 (vs {batter} 타자), {at_bat_pitch_seq}구 {pitch_desc} - {res_text}!"
            summary_text = f"{batter} : 좌전 1루타 안타 출루"
            self.commentary_logs.insert(0, f"🔥 {commentary_text}")
            self._advance_runners(1)
            is_turn_over = True
            curr_session["pitches"].append(self._make_pitch_obj(at_bat_pitch_seq, "SINGLE", res_text, pitch_desc, sb_count_str, commentary_text))
            self.strikes = 0
            self.balls = 0

        elif res == "DOUBLE":
            self.consecutive_hits += 1
            self.consecutive_on_base += 1
            res_text = "타격 (2루타)"
            sb_count_str = f"S-B: {self.strikes}-{self.balls}"
            commentary_text = f"[{inning_str}] {pitcher} 투수 (vs {batter} 타자), {at_bat_pitch_seq}구 {pitch_desc} - {res_text}!"
            summary_text = f"{batter} : 우중간 2루타 적시타"
            self.commentary_logs.insert(0, f"💥 {commentary_text}")
            self._advance_runners(2)
            is_turn_over = True
            curr_session["pitches"].append(self._make_pitch_obj(at_bat_pitch_seq, "DOUBLE", res_text, pitch_desc, sb_count_str, commentary_text))
            self.strikes = 0
            self.balls = 0

        elif res == "HOMERUN":
            self.consecutive_on_base += 1
            runners_count = (1 if self.runner_1b else 0) + (1 if self.runner_2b else 0) + (1 if self.runner_3b else 0)
            pts = 1 + runners_count
            res_text = "타격 (홈런)"
            sb_count_str = f"S-B: {self.strikes}-{self.balls}"
            commentary_text = f"[{inning_str}] {pitcher} 투수 (vs {batter} 타자), {at_bat_pitch_seq}구 {pitch_desc} - 비거리 125m {pts}점 대형 홈런!"
            if self.is_top:
                self.score_away += pts
            else:
                self.score_home += pts
            self.runner_1b = False
            self.runner_2b = False
            self.runner_3b = False
            summary_text = f"{batter} : 비거리 125m {pts}점 대형 홈런!!!"
            self.commentary_logs.insert(0, f"🚀 {commentary_text}")
            is_turn_over = True
            curr_session["pitches"].append(self._make_pitch_obj(at_bat_pitch_seq, "HOMERUN", res_text, pitch_desc, sb_count_str, commentary_text))
            self.strikes = 0
            self.balls = 0

        elif res == "OUT":
            self.outs += 1
            self.consecutive_on_base = 0
            res_text = "아웃"
            sb_count_str = f"S-B: {self.strikes}-{self.balls}"
            commentary_text = f"[{inning_str}] {pitcher} 투수 (vs {batter} 타자), {at_bat_pitch_seq}구 {pitch_desc} - {batter} 땅볼 아웃!"
            summary_text = f"{batter} : 내야 땅볼 아웃"
            self.commentary_logs.insert(0, f"⚾ {commentary_text}")
            is_turn_over = True
            curr_session["pitches"].append(self._make_pitch_obj(at_bat_pitch_seq, "OUT", res_text, pitch_desc, sb_count_str, commentary_text))
            self.strikes = 0
            self.balls = 0

        # 끝내기 승리 체크 (9회말 이상 말 공격 중 홈팀 리드 발생 시 즉시 종료)
        if self._check_walk_off_win():
            return self.get_state()

        if is_turn_over:
            b_stats = self.get_batter_in_game_stats(batter)
            b_stats["tasuk"] += 1

            if res == "STRIKE" and self.strikes >= 3:
                b_stats["tasu"] += 1
                b_stats["samjin"] += 1
            elif res == "BALL" and self.balls >= 4:
                b_stats["bolnet"] += 1
            elif res == "SINGLE":
                b_stats["tasu"] += 1
                b_stats["anta"] += 1
            elif res == "DOUBLE":
                b_stats["tasu"] += 1
                b_stats["anta"] += 1
            elif res == "HOMERUN":
                b_stats["tasu"] += 1
                b_stats["anta"] += 1
                b_stats["homerun"] += 1
                b_stats["deukjeom"] += 1
                b_stats["tajeom"] += (1 + runners_count)
            elif res == "OUT":
                b_stats["tasu"] += 1

            curr_session["batter_stats"] = dict(b_stats)

            new_win_prob = self.get_win_probability()
            delta = round(new_win_prob - curr_session["win_prob"], 1)
            curr_session["win_prob"] = new_win_prob
            curr_session["win_prob_delta"] = delta
            curr_session["play_summary"] = summary_text

            if getattr(self, 'pending_tactic', None):
                actual_result = "OUT" if (res == "OUT" or (res == "STRIKE" and self.strikes >= 3)) else "NOT_OUT"
                my = self.pending_tactic["my_choice"]              # "CHANGE" or "KEEP"
                mgr = self.pending_tactic["actual_manager_choice"] # "CHANGE" or "KEEP"
                
                if my == "CHANGE" and mgr == "CHANGE" and actual_result == "OUT":
                    case_no = 1
                    score_delta = +10
                    title = "동일 선택 & 방어 성공!"
                    commentary = "🟢 [1번 케이스 (+10)] 나(교체) = 감독(교체), 타자 아웃으로 실점 방어 성공!"
                elif my == "CHANGE" and mgr == "CHANGE" and actual_result == "NOT_OUT":
                    case_no = 2
                    score_delta = -10
                    title = "동일 선택 & 실점 허용"
                    commentary = "🔴 [2번 케이스 (-10)] 나(교체) = 감독(교체), 투수 교체에도 불구하고 출루/실점 허용."
                elif my == "CHANGE" and mgr == "KEEP" and actual_result == "OUT":
                    case_no = 3
                    score_delta = -15
                    title = "감독 판단 적중 (교체 불필요)"
                    commentary = "🔴 [3번 케이스 (-15)] 나(교체) vs 감독(유지), 선발 투수가 스스로 아웃을 잡아 교체가 불필요했습니다."
                elif my == "CHANGE" and mgr == "KEEP" and actual_result == "NOT_OUT":
                    case_no = 4
                    score_delta = +15
                    title = "의견 불일치 & 통찰력 적중!"
                    commentary = "🔥 [4번 케이스 (+15)] 나(교체) vs 감독(유지), 감독의 강행 투구 실패! 명장 감독의 투수 교체 통찰력 적중!"
                elif my == "KEEP" and mgr == "CHANGE" and actual_result == "OUT":
                    case_no = 5
                    score_delta = -15
                    title = "감독 투수 교체 적중"
                    commentary = "🔴 [5번 케이스 (-15)] 나(유지) vs 감독(교체), 감독의 투수 교체가 적중하여 아웃을 잡았습니다."
                elif my == "KEEP" and mgr == "CHANGE" and actual_result == "NOT_OUT":
                    case_no = 6
                    score_delta = +15
                    title = "의견 불일치 & 통찰력 적중!"
                    commentary = "🔥 [6번 케이스 (+15)] 나(유지) vs 감독(교체), 감독의 구원 투수 등판 실패! 나의 투수 유지 통찰력 적중!"
                elif my == "KEEP" and mgr == "KEEP" and actual_result == "OUT":
                    case_no = 7
                    score_delta = +10
                    title = "동일 선택 & 선발 믿음 성공!"
                    commentary = "🟢 [7번 케이스 (+10)] 나(유지) = 감독(유지), 선발 투수 신뢰가 삼진/아웃으로 결실을 맺었습니다!"
                else:
                    case_no = 8
                    score_delta = -10
                    title = "동일 선택 & 강행 투구 실패"
                    commentary = "🔴 [8번 케이스 (-10)] 나(유지) = 감독(유지), 강행 투구 선택 결과 출루/실점을 허용했습니다."

                self.manager_score += score_delta
                self._update_manager_grade()
                database.update_user_score(self.manager_score, self.manager_grade)

                log_msg = f"📊 [위기 채점 {case_no}번 케이스] {commentary}"
                self.commentary_logs.insert(0, log_msg)
                database.log_tactic(self.pending_tactic["inning_str"], self.pending_tactic["situation_title"], f"CASE_{case_no}", score_delta, self.manager_grade, commentary)

                self.last_tactic_resolution = {
                    "case_no": case_no,
                    "my_choice": my,
                    "actual_manager_choice": mgr,
                    "actual_result": actual_result,
                    "my_choice_label": "교체 (O)" if my == "CHANGE" else "유지 (X)",
                    "mgr_choice_label": "교체 (O)" if mgr == "CHANGE" else "유지 (X)",
                    "actual_result_label": "아웃 (O)" if actual_result == "OUT" else "아웃 외 상황 (X)",
                    "score_delta": score_delta,
                    "total_score": self.manager_score,
                    "grade": self.manager_grade,
                    "title": title,
                    "commentary": commentary
                }
                self.pending_tactic = None

            self._next_batter()
            self._check_half_inning_transition()
            if not self.game_over:
                self.init_first_session()
        else:
            self._check_half_inning_transition()

        if not self.game_over and not getattr(self, 'has_crisis_popped_for_current_batter', False) and not getattr(self, 'pending_tactic', None):
            crisis = self.check_crisis_trigger()
            if crisis:
                self.crisis_active = True
                self.current_crisis = crisis
                self.has_crisis_popped_for_current_batter = True
                log_msg = f"🚨 [위기 경보] {crisis['title']} - {crisis['desc']}"
                if not self.commentary_logs or log_msg not in self.commentary_logs[0]:
                    self.commentary_logs.insert(0, log_msg)

        return self.get_state()

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
        """[위기 감지 조건문 (Crisis Detection Logic)]
        조건 A: 현재 투수 투구수 < 70구 AND 연속 4타자 출루 발생 시
        조건 B: 현재 투수 투구수 >= 70구 AND 주자 득점권(2루 또는 3루) 진출 시
        """
        if self.outs >= 3 or self.game_over:
            return None

        p_count = self.totalPitcherCount
        on_base_4 = (self.consecutive_on_base >= 4)
        has_scoring_pos = self.runner_2b or self.runner_3b

        is_cond_a = (p_count < 70) and on_base_4
        is_cond_b = (p_count >= 70) and has_scoring_pos

        if not (is_cond_a or is_cond_b):
            return None

        inning_str = f"{self.inning}회{'초' if self.is_top else '말'}"
        pitcher = self.get_current_pitcher()
        batter = self.get_current_batter()

        if is_cond_a:
            condition_type = "CONDITION_A"
            condition_label = "조건 A: 70구 미만 4타자 연속 출루 위기!"
            reason_str = f"투구수 {p_count}구, 연속 4타자 출루 허용!"
        else:
            condition_type = "CONDITION_B"
            condition_label = "조건 B: 70구 이상 득점권 실점 위기!"
            reason_str = f"투구수 {p_count}구, 득점권(2/3루) 주자 진출!"

        return {
            "id": "PITCHER_CHANGE_CRISIS",
            "condition_type": condition_type,
            "condition_label": condition_label,
            "title": "🚨 [위기 관리] 투수 교체 감독 지시 팝업",
            "desc": f"{inning_str} {reason_str} (현재 투수: {pitcher}, 다음 타석: {batter})",
            "pitcher_name": pitcher,
            "pitch_count": p_count,
            "consecutive_on_base": self.consecutive_on_base,
            "runner_2b": self.runner_2b,
            "runner_3b": self.runner_3b,
            "options": [
                {
                    "id": "PITCHER_CHANGE",
                    "name": "투수 교체하기",
                    "risk": "교체 (+)",
                    "desc": "불펜 구원 투수로 마운드를 교체하고 감독 스코어 가산"
                },
                {
                    "id": "KEEP_PITCHER",
                    "name": "투수 교체하지 않기",
                    "risk": "유지 (-)",
                    "desc": "현재 투수로 계속 진행 (강행 투구)"
                }
            ]
        }

    def apply_tactic(self, tactic_id):
        """[위기 관리 전략 수립 및 채점 대기 상태 전환]"""
        inning_str = f"{self.inning}회{'초' if self.is_top else '말'}"
        situation_title = self.current_crisis["title"] if self.current_crisis else "투수 교체 위기 상황"
        old_pitcher = self.get_current_pitcher()

        my_choice = "CHANGE" if tactic_id == "PITCHER_CHANGE" else "KEEP"
        actual_manager_choice = "CHANGE" if random.random() < 0.5 else "KEEP"

        def_team = self.get_current_defense_team()
        relief_pitchers = {
            "삼성": "김재윤", "한화": "주현상", "KIA": "정해영", "LG": "유영찬",
            "SSG": "조병현", "두산": "김택연", "NC": "류진욱", "KT": "박영현",
            "키움": "조상우", "롯데": "김원중"
        }
        relief_name = relief_pitchers.get(def_team, "구원투수")
        new_pitcher_fullname = f"{relief_name} (구원)" if actual_manager_choice == "CHANGE" else old_pitcher

        if actual_manager_choice == "CHANGE":
            # 실제 감독이 [투수 교체]를 선택한 경우 -> 실제 마운드 교체 및 투구수 초기화
            self.totalPitcherCount = 0
            self.consecutive_on_base = 0
            self.currentBatterPitchCount = 0

            if self.is_top:
                self.home_pitcher = new_pitcher_fullname
            else:
                self.away_pitcher = new_pitcher_fullname

        if not self.batter_sessions:
            self.init_first_session()

        curr_session = self.batter_sessions[0]
        pitch_seq = len(curr_session.get("pitches", [])) + 1

        change_event = {
            "seq": pitch_seq,
            "type": "PITCHER_CHANGE",
            "is_pitcher_change": True,
            "old_pitcher": old_pitcher,
            "new_pitcher": new_pitcher_fullname,
            "result": "투수 교체" if actual_manager_choice == "CHANGE" else "투수 유지",
            "commentary_text": f"🔄 [실제 감독 선택: 투수 교체] 마운드 투수 교체: {old_pitcher} ➔ {new_pitcher_fullname}" if actual_manager_choice == "CHANGE" else f"🛡️ [실제 감독 선택: 투수 유지] 선발 투수 {old_pitcher} 마운드 계속 투구"
        }
        curr_session["pitches"].append(change_event)

        self.pending_tactic = {
            "my_choice": my_choice,
            "actual_manager_choice": actual_manager_choice,
            "old_pitcher": old_pitcher,
            "new_pitcher": new_pitcher_fullname,
            "inning_str": inning_str,
            "situation_title": situation_title
        }

        self.has_crisis_popped_for_current_batter = True
        self.crisis_active = False
        self.current_crisis = None

        log_msg = f"📋 [위기 관리 작전 제출] 나의 선택: {'교체 (O)' if my_choice == 'CHANGE' else '유지 (X)'} | 실제 감독: {'교체 (O)' if actual_manager_choice == 'CHANGE' else '유지 (X)'} (다음 타석 결과로 판정)"
        self.commentary_logs.insert(0, log_msg)

        return {
            "status": "success",
            "pending": True,
            "tactic_id": tactic_id,
            "my_choice": my_choice,
            "actual_manager_choice": actual_manager_choice,
            "old_pitcher": old_pitcher,
            "new_pitcher": new_pitcher_fullname,
            "commentary": log_msg,
            "state": self.get_state()
        }

    def _advance_runners(self, bases):
        if bases == 1:
            if self.runner_3b:
                self._score_run()
            self.runner_3b = self.runner_2b
            self.runner_2b = self.runner_1b
            self.runner_1b = True
        elif bases == 2:
            if self.runner_3b:
                self._score_run()
            if self.runner_2b:
                self._score_run()
            self.runner_3b = self.runner_1b
            self.runner_2b = True
            self.runner_1b = False

    def _score_run(self):
        if self.is_top:
            self.score_away += 1
        else:
            self.score_home += 1

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
            "pitcher": self.get_current_pitcher(),
            "batter": self.get_current_batter(),
            "on_deck_batters": self.get_on_deck_batters(),
            "fielders": self.get_current_defense_fielders(),
            "currentBatterPitchCount": self.currentBatterPitchCount,
            "totalPitcherCount": self.totalPitcherCount,
            "pitch_count": self.totalPitcherCount,
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

