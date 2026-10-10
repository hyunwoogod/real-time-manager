"""비밀번호 재설정 인증번호 메일 발송 (Gmail SMTP + 앱 비밀번호)

필요한 환경변수:
  MAIL_USERNAME      보내는 Gmail 주소 (예: zipgamdok.help@gmail.com)
  MAIL_APP_PASSWORD  Google 계정에서 만든 16자리 앱 비밀번호
"""
import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

SMTP_HOST = os.environ.get('MAIL_SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('MAIL_SMTP_PORT', 465))


def _credentials():
    username = os.environ.get('MAIL_USERNAME', '').strip()
    password = os.environ.get('MAIL_APP_PASSWORD', '').replace(' ', '').strip()
    return username, password


def is_configured():
    username, password = _credentials()
    return bool(username and password)


def send_reset_code(to_email, code, nickname='', minutes=10):
    """인증번호 메일 발송. 성공하면 True"""
    username, password = _credentials()
    if not (username and password):
        print("⚠️ [MAIL] MAIL_USERNAME / MAIL_APP_PASSWORD가 설정되지 않아 메일을 보낼 수 없습니다.")
        return False

    greeting = f"{nickname} 감독님, " if nickname else ""
    msg = EmailMessage()
    msg['Subject'] = f"[집감독] 비밀번호 재설정 인증번호 {code}"
    msg['From'] = formataddr(('집감독', username))
    msg['To'] = to_email
    msg.set_content(
        f"{greeting}안녕하세요.\n\n"
        f"비밀번호 재설정 인증번호는 [{code}] 입니다.\n"
        f"{minutes}분 안에 입력해 주세요.\n\n"
        "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.\n\n"
        "- 집감독 드림"
    )
    msg.add_alternative(f"""
<div style="font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <h2 style="margin: 0 0 12px;">⚾ 집감독 비밀번호 재설정</h2>
  <p>{greeting}안녕하세요.<br>아래 인증번호를 {minutes}분 안에 입력해 주세요.</p>
  <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; background: #f1f5f9; border-radius: 12px; padding: 16px; text-align: center; margin: 16px 0;">{code}</div>
  <p style="color: #64748b; font-size: 13px;">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>
</div>
""", subtype='html')

    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
            smtp.login(username, password)
            smtp.send_message(msg)
        return True
    except Exception as e:
        print(f"⚠️ [MAIL] 인증번호 메일 발송 실패: {type(e).__name__}: {e}")
        return False
