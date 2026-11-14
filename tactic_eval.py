"""투수 교체·대타 판단 채점용 승리 확률 계산.

경기 엔진과 같은 규칙(한 구 확률, 주자 이동)으로 정확한 기댓값을 계산한다.
- 승리 확률 표: 리그 평균 전력으로 만든 이닝·점수 차·주자·아웃별 홈팀 승리 확률
- 타자 k명 기댓값: 지정한 투수·타자 능력으로 k타석을 모두 계산한 뒤 위 표로 평가
가상 능력치 단계에서는 게임 구조 검증용이며, 실제 기록이 들어오면 입력값만 바뀐다.
"""
from functools import lru_cache

KINDS = ("WALK", "K", "SINGLE", "DOUBLE", "TRIPLE", "HOMERUN", "ERROR", "GROUND", "FLY", "LINE")
_ROLLS = tuple((i + 0.5) / 20 for i in range(20))
_MAX_RUNS = 12
LEAGUE = {"q": 0.5, "control": 0.345, "avg": 0.28, "power": 0.3}


def pa_probs(q, control, fatigue, avg, power):
    """타석 결과 확률 (엔진의 _simulate_pitch, _simulate_in_play와 같은 식)"""
    f = fatigue
    hit = max(0.05, min(0.8, 0.335 + (avg - 0.27) * 1.3 + 0.07 * f - (q - 0.5) * 0.07))
    hr, triple, double = 0.045 + power * 0.12, 0.02, 0.15 + power * 0.08
    in_play = {
        "HOMERUN": hit * hr, "TRIPLE": hit * triple, "DOUBLE": hit * double,
        "SINGLE": hit * max(0.0, 1 - hr - triple - double), "ERROR": (1 - hit) * 0.02,
    }
    rest = (1 - hit) * 0.98
    in_play.update({"GROUND": rest * 0.46, "FLY": rest * 0.38, "LINE": rest * 0.16})

    strike = 0.285 - 0.05 * f + (q - 0.5) * 0.06

    def ball_p(b, s):
        p = min(0.5, control + 0.045 * f)
        if b == 3:
            p -= 0.06
        if s == 2 and b < 2:
            p += 0.04
        return p

    # 볼카운트별 (볼넷, 삼진, 인플레이) 도달 확률
    memo = {}
    for s in (2, 1, 0):
        for b in (3, 2, 1, 0):
            pb = ball_p(b, s)
            foul = 0.41 + (0.06 if s == 2 else 0)
            play = max(0.0, 1 - strike - foul)
            ball_next = (1.0, 0.0, 0.0) if b == 3 else memo[(b + 1, s)]
            if s == 2:   # 2스트라이크 파울은 같은 카운트로 돌아옴
                denom = 1 - (1 - pb) * foul
                memo[(b, s)] = tuple(
                    (pb * ball_next[i] + (1 - pb) * (strike * (i == 1) + play * (i == 2))) / denom for i in range(3))
            else:
                strike_next = memo[(b, s + 1)]
                memo[(b, s)] = tuple(
                    pb * ball_next[i] + (1 - pb) * ((strike + foul) * strike_next[i] + play * (i == 2)) for i in range(3))
    walk, k, ip = memo[(0, 0)]
    out = {"WALK": walk, "K": k}
    out.update({kind: ip * p for kind, p in in_play.items()})
    return out


@lru_cache(maxsize=None)
def _transitions(mask, outs, kind):
    """(확률, 새 주자, 늘어난 아웃, 득점) 목록: 엔진의 apply_outcome을 그대로 사용"""
    from game_engine import apply_outcome
    grouped = {}
    for roll in _ROLLS:
        bases = {n: (f"r{n}" if mask & (1 << (n - 1)) else None) for n in (1, 2, 3)}
        b, add, runs, _ = apply_outcome(bases, outs, {"kind": kind, "roll": roll}, "batter")
        new_mask = sum(1 << (n - 1) for n in (1, 2, 3) if b[n])
        key = (new_mask, add, runs)
        grouped[key] = grouped.get(key, 0) + 1 / len(_ROLLS)
    return tuple((p, *key) for key, p in grouped.items())


@lru_cache(maxsize=1)
def _half_inning_table():
    """남은 이닝의 추가 득점 분포: table[(아웃, 주자)][득점]"""
    league = pa_probs(LEAGUE["q"], LEAGUE["control"], 0.0, LEAGUE["avg"], LEAGUE["power"])
    table = {(o, m): [1.0] + [0.0] * _MAX_RUNS for o in range(3) for m in range(8)}
    for _ in range(45):
        next_table = {}
        for (outs, mask) in table:
            dist = [0.0] * (_MAX_RUNS + 1)
            for kind, pk in league.items():
                for p, new_mask, add, runs in _transitions(mask, outs, kind):
                    weight = pk * p
                    if outs + add >= 3:
                        dist[0] += weight
                        continue
                    sub = table[(outs + add, new_mask)]
                    for r, q in enumerate(sub):
                        dist[min(_MAX_RUNS, r + runs)] += weight * q
            next_table[(outs, mask)] = dist
        table = next_table
    return table


def _after_half(inning, is_top, diff):
    """이번 반 이닝이 끝난 뒤 홈팀 승리 확률 (diff = 홈 - 원정)"""
    if is_top:
        if inning >= 9 and diff > 0:
            return 1.0
        return _half_start(inning, False, diff)
    if inning < 9:
        return _half_start(inning + 1, True, diff)
    if diff > 0:
        return 1.0
    if diff < 0:
        return 0.0
    return _half_start(inning + 1, True, 0) if inning < 11 else 0.5


@lru_cache(maxsize=None)
def _half_start(inning, is_top, diff):
    if diff > 15:
        return 1.0
    if diff < -15:
        return 0.0
    return home_win_prob(inning, is_top, 0, 0, diff)


def home_win_prob(inning, is_top, outs, mask, diff):
    """지금 상황의 홈팀 승리 확률 (무승부는 절반)"""
    total = 0.0
    for runs, p in enumerate(_half_inning_table()[(outs, mask)]):
        if p <= 0:
            continue
        if is_top:
            total += p * _after_half(inning, True, diff - runs)
        elif inning >= 9 and diff + runs > 0:
            total += p
        else:
            total += p * _after_half(inning, False, diff + runs)
    return total


def expect_window(snapshot, probs_list):
    """스냅샷에서 지정한 타자들을 상대한 뒤의 (홈팀 승리 확률, 공격 팀 득점) 기댓값"""
    inning, is_top = snapshot["inning"], snapshot["is_top"]
    memo = {}

    def go(i, outs, mask, diff):
        if i >= len(probs_list):
            return home_win_prob(inning, is_top, outs, mask, diff), 0.0
        key = (i, outs, mask, diff)
        if key in memo:
            return memo[key]
        wp, runs_total = 0.0, 0.0
        for kind, pk in probs_list[i].items():
            for p, new_mask, add, runs in _transitions(mask, outs, kind):
                weight = pk * p
                new_diff = diff - runs if is_top else diff + runs
                if outs + add >= 3:
                    value, later = _after_half(inning, is_top, new_diff), 0.0
                elif not is_top and inning >= 9 and new_diff > 0:
                    value, later = 1.0, 0.0
                else:
                    value, later = go(i + 1, outs + add, new_mask, new_diff)
                wp += weight * value
                runs_total += weight * (runs + later)
        memo[key] = (wp, runs_total)
        return memo[key]

    return go(0, snapshot["outs"], snapshot["mask"], snapshot["diff"])


def points_for(delta_pct):
    """승리 확률 1%당 3P, 1% 미만은 0P, 한 번에 최대 ±50P"""
    if abs(delta_pct) < 1:
        return 0
    return max(-50, min(50, round(delta_pct * 3)))


def grade_label(delta_pct):
    if delta_pct >= 10:
        return "명장의 한 수"
    if delta_pct >= 1:
        return "좋은 판단"
    if delta_pct <= -10:
        return "무리수"
    if delta_pct <= -1:
        return "아쉬운 판단"
    return "막상막하"
