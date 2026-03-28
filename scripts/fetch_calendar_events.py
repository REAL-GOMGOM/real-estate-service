#!/usr/bin/env python3
"""
부동산 달력 이벤트 수집 스크립트

실행 주기: launchd로 하루 2회 (오전 7시, 오후 6시)
데이터 소스:
  - 국토부 보도자료 RSS
  - 금융위원회 보도자료 RSS
  - 한국은행 보도자료 RSS
  - 공공데이터포트 청약홈 API (향후 확장)

사용법:
  python3 scripts/fetch_calendar_events.py
"""

import os
import re
import sys
import json
import sqlite3
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from html import unescape
from typing import Optional

try:
    import urllib.request
    import urllib.error
except ImportError:
    pass

# ── 설정 ──────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DB_PATH = PROJECT_DIR / "data" / "calendar.db"

# .env.local에서 API 키 로드
ENV_PATH = PROJECT_DIR / ".env.local"

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger("calendar_fetcher")

# RSS 소스
RSS_SOURCES = [
    {
        "name": "국토부 보도자료",
        "url": "https://www.molit.go.kr/USR/BORD0201/m_69/RSS.jsp",
        "category": "policy",
        "keywords": ["부동산", "주택", "아파트", "전세", "분양", "공급", "LTV", "DTI", "DSR", "재건축", "재개발"],
    },
]

# Anthropic API (Claude Haiku) - 이벤트 분류용
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"


def load_env():
    """Load .env.local file"""
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                env[key.strip()] = val.strip()
    return env


def get_db():
    """SQLite 연결 반환 (calendar_events 테이블 자동 생성)"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS calendar_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_date DATE NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('subscription','rate','move_in','policy','loan','index','other')),
            title TEXT NOT NULL,
            description TEXT,
            source_url TEXT,
            icon TEXT,
            importance TEXT DEFAULT 'normal' CHECK(importance IN ('high','normal','low')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(event_date, title)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(event_date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_calendar_category ON calendar_events(category)")
    conn.commit()
    return conn


def strip_html(text: str) -> str:
    """HTML 태그 제거 + unescape"""
    text = unescape(text)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def fetch_rss(url: str, timeout: int = 15) -> list:
    """RSS 피드를 파싱하여 아이템 리스트 반환"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
        root = ET.fromstring(data)

        items = []
        for item in root.iter("item"):
            title = item.findtext("title", "").strip()
            link = item.findtext("link", "").strip()
            pub_date = item.findtext("pubDate", "").strip()
            desc = strip_html(item.findtext("description", ""))

            if title:
                items.append({
                    "title": title,
                    "link": link,
                    "pub_date": pub_date,
                    "description": desc[:200],  # 200자 제한
                })
        return items

    except Exception as e:
        logger.error(f"RSS 가져오기 실패 ({url}): {e}")
        return []


def parse_date_from_pubdate(pub_date: str) -> Optional[str]:
    """RSS pubDate를 YYYY-MM-DD 포맷으로 변환"""
    formats = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(pub_date.strip(), fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    # 날짜 파싱 실패 시 오늘 날짜 사용
    return datetime.now().strftime("%Y-%m-%d")


def is_relevant(title: str, description: str, keywords: list) -> bool:
    """키워드 기반 관련성 필터"""
    text = (title + " " + description).lower()
    return any(kw.lower() in text for kw in keywords)


CATEGORY_ICONS = {
    "subscription": "🏠",
    "rate": "🏦",
    "move_in": "🏗️",
    "policy": "📋",
    "loan": "💰",
    "index": "📊",
    "other": "📌",
}


def classify_with_haiku(title: str, description: str, api_key: str) -> Optional[dict]:
    """
    Claude Haiku로 이벤트 분류 + 20자 이내 제목 생성.
    API 키가 없으면 None 반환 (키워드 기반 fallback 사용).
    """
    if not api_key:
        return None

    prompt = f"""아래 부동산 관련 뉴스를 분석하여 JSON으로 답하세요.
제목: {title}
내용: {description}

JSON 형식:
{{"category": "subscription|rate|move_in|policy|loan|index|other", "short_title": "20자 이내 요약 제목", "importance": "high|normal|low"}}

카테고리 기준:
- subscription: 청약, 분양 관련
- rate: 금리, 기준금리, FOMC 관련
- move_in: 입주, 준공 관련
- policy: 부동산 정책, 규제 관련
- loan: 대출, DSR, LTV 관련
- index: 부동산 지표, 통계, 동향 관련
- other: 기타

JSON만 출력하세요."""

    try:
        body = json.dumps({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 200,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()

        req = urllib.request.Request(
            ANTHROPIC_API_URL,
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())

        text = result["content"][0]["text"].strip()
        # JSON 추출
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        logger.warning(f"Haiku 분류 실패: {e}")

    return None


def keyword_classify(title: str, description: str) -> dict:
    """키워드 기반 간단 분류 (Haiku 대체)"""
    text = (title + " " + description).lower()

    if any(k in text for k in ["청약", "분양", "당첨", "1순위", "특별공급"]):
        cat = "subscription"
    elif any(k in text for k in ["금리", "기준금리", "금통위", "fomc", "인하", "인상"]):
        cat = "rate"
    elif any(k in text for k in ["입주", "준공", "이사"]):
        cat = "move_in"
    elif any(k in text for k in ["대출", "dsr", "ltv", "dti", "모기지"]):
        cat = "loan"
    elif any(k in text for k in ["지표", "동향", "통계", "지수", "콘도"]):
        cat = "index"
    elif any(k in text for k in ["정책", "규제", "세제", "법안", "개편"]):
        cat = "policy"
    else:
        cat = "other"

    return {
        "category": cat,
        "short_title": title[:20],
        "importance": "normal",
    }


def upsert_event(conn: sqlite3.Connection, event: dict):
    """이벤트 upsert (중복 시 무시)"""
    try:
        conn.execute("""
            INSERT OR IGNORE INTO calendar_events
                (event_date, category, title, description, source_url, icon, importance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            event["event_date"],
            event["category"],
            event["title"],
            event.get("description"),
            event.get("source_url"),
            CATEGORY_ICONS.get(event["category"], "📌"),
            event.get("importance", "normal"),
        ))
    except sqlite3.IntegrityError:
        pass


def fetch_rss_events(conn: sqlite3.Connection, api_key: str):
    """RSS 소스에서 이벤트 수집"""
    for source in RSS_SOURCES:
        logger.info(f"RSS 수집: {source['name']}")
        items = fetch_rss(source["url"])
        count = 0

        for item in items:
            if not is_relevant(item["title"], item["description"], source["keywords"]):
                continue

            event_date = parse_date_from_pubdate(item["pub_date"])
            if not event_date:
                continue

            # Haiku 분류 시도 → fallback: 키워드 분류
            classification = classify_with_haiku(item["title"], item["description"], api_key)
            if not classification:
                classification = keyword_classify(item["title"], item["description"])

            upsert_event(conn, {
                "event_date": event_date,
                "category": classification.get("category", source["category"]),
                "title": classification.get("short_title", item["title"][:20]),
                "description": item["description"],
                "source_url": item["link"],
                "importance": classification.get("importance", "normal"),
            })
            count += 1

        conn.commit()
        logger.info(f"  → {count}건 저장/업데이트")


def main():
    logger.info("=== 부동산 달력 이벤트 수집 시작 ===")

    env = load_env()
    api_key = env.get("ANTHROPIC_API_KEY", "")

    # 곰곰봇 .env에서도 시도
    openclaw_env = Path.home() / ".openclaw" / ".env"
    if not api_key and openclaw_env.exists():
        for line in openclaw_env.read_text().splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                api_key = line.split("=", 1)[1].strip()
                break

    if not api_key:
        logger.warning("ANTHROPIC_API_KEY 없음 → 키워드 기반 분류만 사용")

    conn = get_db()

    try:
        fetch_rss_events(conn, api_key)
        logger.info("=== 수집 완료 ===")
    except Exception as e:
        logger.error(f"수집 중 오류: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
