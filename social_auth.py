"""소셜 로그인 (카카오 / 구글 / 네이버) - OAuth 2.0 Authorization Code 방식

필요한 환경변수 (설정된 로그인 방식만 로그인 화면에 버튼이 나타남):
  KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET(선택: 카카오 콘솔에서 Client Secret을 켠 경우)
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
"""
import os
import json
import urllib.parse
import urllib.request

PROVIDERS = {
    'kakao': {
        'name': '카카오',
        'authorize_url': 'https://kauth.kakao.com/oauth/authorize',
        'token_url': 'https://kauth.kakao.com/oauth/token',
        'profile_url': 'https://kapi.kakao.com/v2/user/me',
        'client_id_env': 'KAKAO_REST_API_KEY',
        'client_secret_env': 'KAKAO_CLIENT_SECRET',
        'secret_required': False,
        'scope': '',
    },
    'google': {
        'name': '구글',
        'authorize_url': 'https://accounts.google.com/o/oauth2/v2/auth',
        'token_url': 'https://oauth2.googleapis.com/token',
        'profile_url': 'https://openidconnect.googleapis.com/v1/userinfo',
        'client_id_env': 'GOOGLE_CLIENT_ID',
        'client_secret_env': 'GOOGLE_CLIENT_SECRET',
        'secret_required': True,
        'scope': 'openid email profile',
    },
    'naver': {
        'name': '네이버',
        'authorize_url': 'https://nid.naver.com/oauth2.0/authorize',
        'token_url': 'https://nid.naver.com/oauth2.0/token',
        'profile_url': 'https://openapi.naver.com/v1/nid/me',
        'client_id_env': 'NAVER_CLIENT_ID',
        'client_secret_env': 'NAVER_CLIENT_SECRET',
        'secret_required': True,
        'scope': '',
    },
}


class SocialLoginError(Exception):
    pass


def _client(provider):
    conf = PROVIDERS[provider]
    client_id = os.environ.get(conf['client_id_env'], '').strip()
    client_secret = os.environ.get(conf['client_secret_env'], '').strip()
    return client_id, client_secret


def is_configured(provider):
    if provider not in PROVIDERS:
        return False
    client_id, client_secret = _client(provider)
    return bool(client_id and (client_secret or not PROVIDERS[provider]['secret_required']))


def enabled_providers():
    """로그인 화면에 보여줄 (코드, 이름) 목록"""
    return [(p, PROVIDERS[p]['name']) for p in ('kakao', 'naver', 'google') if is_configured(p)]


def authorize_url(provider, redirect_uri, state):
    conf = PROVIDERS[provider]
    client_id, _ = _client(provider)
    params = {
        'response_type': 'code',
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'state': state,
    }
    if conf['scope']:
        params['scope'] = conf['scope']
    if provider == 'google':
        params['prompt'] = 'select_account'
    return conf['authorize_url'] + '?' + urllib.parse.urlencode(params)


def _request_json(url, data=None, headers=None):
    body = urllib.parse.urlencode(data).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers or {})
    if body is not None:
        req.add_header('Content-Type', 'application/x-www-form-urlencoded;charset=utf-8')
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:300]
        raise SocialLoginError(f"HTTP {e.code}: {detail}")
    except Exception as e:
        raise SocialLoginError(f"{type(e).__name__}: {e}")


def fetch_profile(provider, code, redirect_uri, state):
    """인가 코드를 토큰으로 바꾸고 사용자 정보를 {'id', 'email', 'nickname'}으로 반환"""
    conf = PROVIDERS[provider]
    client_id, client_secret = _client(provider)

    token_params = {
        'grant_type': 'authorization_code',
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'code': code,
    }
    if client_secret:
        token_params['client_secret'] = client_secret
    if provider == 'naver':
        token_params['state'] = state

    token = _request_json(conf['token_url'], data=token_params)
    access_token = token.get('access_token')
    if not access_token:
        raise SocialLoginError(f"토큰 발급 실패: {token.get('error_description') or token.get('error') or token}")

    info = _request_json(conf['profile_url'], headers={'Authorization': f'Bearer {access_token}'})

    if provider == 'kakao':
        account = info.get('kakao_account') or {}
        profile = account.get('profile') or {}
        return {
            'id': str(info.get('id') or ''),
            'email': account.get('email') or '',
            'nickname': profile.get('nickname') or (info.get('properties') or {}).get('nickname') or '',
        }
    if provider == 'google':
        return {
            'id': str(info.get('sub') or ''),
            'email': (info.get('email') or '') if info.get('email_verified', True) else '',
            'nickname': info.get('name') or '',
        }
    if provider == 'naver':
        resp = info.get('response') or {}
        return {
            'id': str(resp.get('id') or ''),
            'email': resp.get('email') or '',
            'nickname': resp.get('nickname') or resp.get('name') or '',
        }
    raise SocialLoginError('지원하지 않는 로그인 방식입니다.')
