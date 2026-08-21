# Obsidian 글창고 export 운영 계약

`scripts/export-obsidian.ts`는 Neon의 블로그 글과 로컬 SQLite의 뉴스 아카이브를
iCloud Drive의 Obsidian 글창고로 내보낸다. 두 원천 조회와 stage 검증이 모두
성공한 뒤에만 기존 관리 경로를 교체한다. Neon 402, 네트워크 장애, SQLite 오류가
발생하면 마지막 성공본을 그대로 보존해야 한다.

## launchd 설치 원칙

- `scripts/launchd/com.gomgom.obsidian-export.plist.example`의 placeholder를 모두
  절대경로로 치환한다.
- `WorkingDirectory`는 검증된 장기 운영 clone만 사용한다. legacy clone이나 날짜가
  붙은 Codex worktree를 지정하지 않는다.
- `ProgramArguments`는 절대 Node 경로와 `--import tsx`를 사용한다. shell, `npx`,
  `node_modules/.bin/tsx`에 의존하지 않는다.
- `NAEZIP_ENV_FILE`은 mode `0600`인 운영 환경파일의 절대경로로 지정한다.
- 설치 전 `plutil -lint`와 placeholder 잔존 여부를 확인한다.

예시 치환값:

```text
__ABSOLUTE_NODE_BINARY__=/opt/homebrew/bin/node
__LONG_LIVED_REPOSITORY_ROOT__=/Users/bangjoohan/naezip-production/real-estate-service
__ABSOLUTE_SECURE_ENV_FILE__=/Users/bangjoohan/real-estate-service/.env.local
__ABSOLUTE_LOG_DIRECTORY__=/Users/bangjoohan/Library/Logs
```

## 장애 시 확인

`NeonDbError`, HTTP 402, `DATABASE_URL 미설정`이 보이면 원천 복구 전까지 수동
재실행하지 않는다. 안전한 exporter는 이 실패에서 기존 `내집 칼럼`,
`뉴스 아카이브`, `홈.md`를 삭제하거나 교체하지 않는다. 대상 폴더가 이미 사라졌다면
iCloud Recently Deleted 또는 별도 백업에서 먼저 복구하고, 불완전한 로컬 자료로
43편 원본을 재구성하지 않는다.
