# gunicorn이 시작할 때 자동으로 읽는 설정 (Render 시작 명령을 바꾸지 않아도 적용됨)
# - 경기 상태를 서버 메모리에 사용자별로 들고 있으므로 프로세스는 1개만 사용
# - 대신 스레드를 여러 개 두어, 한 요청이 오래 걸려도 다른 요청이 줄 서서 기다리지 않게 함
workers = 1
worker_class = "gthread"
threads = 8
timeout = 60
