#!/usr/bin/env python3
"""
NEIS 학교기본정보 API → SQLite 동기화 스크립트

실행: python3 scripts/api_sync/sync_schools.py
주기: 월 1회
"""

import os
import sys
import json
import sqlite3
import time
import logging
import hashlib
from pathlib import Path
from typing import Optional

try:
    import urllib.request
    import urllib.error
except ImportError:
    pass

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent.parent
DB_PATH = PROJECT_DIR / "data" / "realestate.db"
ENV_PATH = PROJECT_DIR / ".env.local"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sync_schools")

NEIS_API_URL = "https://open.neis.go.kr/hub/schoolInfo"

# 서울 주요 학군 지역의 시도교육청 코드
ATPT_CODES = {
    "B10": "서울특별시교육청",
    "E10": "인천광역시교육청",
    "J10": "경기도교육청",
}

SCHOOL_LEVEL_MAP = {
    "초등학교": "elementary",
    "중학교": "middle",
    "고등학교": "high",
    "특수학교": None,
    "각종학교": None,
}

# 주요 학군 지역 좌표 (수동 매핑 - Geocoding 대체)
# 구 중심 좌표로 학교 위치 근사 (향후 카카오 REST API로 정확한 Geocoding)
DISTRICT_COORDS = {
    "강남구": (37.5172, 127.0473),
    "서초구": (37.4837, 127.0324),
    "송파구": (37.5145, 127.1059),
    "강동구": (37.5301, 127.1238),
    "양천구": (37.5170, 126.8664),
    "노원구": (37.6542, 127.0568),
    "마포구": (37.5664, 126.9014),
    "성동구": (37.5633, 127.0371),
    "용산구": (37.5326, 126.9905),
    "광진구": (37.5385, 127.0823),
    "동작구": (37.5124, 126.9393),
    "영등포구": (37.5264, 126.8963),
    "분당구": (37.3825, 127.1192),
    "수지구": (37.3219, 127.0986),
    "과천시": (37.4292, 126.9876),
    "하남시": (37.5393, 127.2148),
    "해운대구": (35.1631, 129.1636),
    "수성구": (35.8581, 128.6316),
}


def load_env():
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                env[key.strip()] = val.strip()
    return env


def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    # 테이블이 없으면 생성
    conn.execute("""
        CREATE TABLE IF NOT EXISTS schools (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            school_level TEXT NOT NULL,
            address TEXT,
            latitude REAL,
            longitude REAL,
            establish_type TEXT,
            coedu_type TEXT,
            student_count INTEGER,
            teacher_count INTEGER,
            district TEXT,
            region TEXT,
            neis_code TEXT,
            atpt_code TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_schools_level ON schools(school_level)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_schools_district ON schools(district)")
    conn.commit()
    return conn


def extract_district(address: str) -> Optional[str]:
    """주소에서 구/시 이름 추출"""
    for dist in DISTRICT_COORDS:
        if dist in address:
            return dist
    return None


def approximate_coords(address: str, district: Optional[str], idx: int) -> Optional[tuple]:
    """구 중심 좌표 + 약간의 오프셋으로 좌표 근사"""
    if not district or district not in DISTRICT_COORDS:
        return None
    base_lat, base_lng = DISTRICT_COORDS[district]
    # 해시 기반 결정론적 오프셋 (같은 학교는 항상 같은 위치)
    h = int(hashlib.md5(address.encode()).hexdigest()[:8], 16)
    offset_lat = ((h % 1000) - 500) * 0.00003  # 약 ±15m
    offset_lng = (((h >> 10) % 1000) - 500) * 0.00003
    return (base_lat + offset_lat, base_lng + offset_lng)


def fetch_schools(api_key: str, atpt_code: str, page: int = 1, size: int = 100) -> list:
    """NEIS API에서 학교 목록 가져오기"""
    params = f"KEY={api_key}&Type=json&ATPT_OFCDC_SC_CODE={atpt_code}&pIndex={page}&pSize={size}"
    url = f"{NEIS_API_URL}?{params}"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())

        info = data.get("schoolInfo", [])
        if len(info) < 2:
            return []

        total = info[0]["head"][0]["list_total_count"]
        rows = info[1].get("row", [])
        return rows, total

    except Exception as e:
        logger.error(f"NEIS API 호출 실패: {e}")
        return [], 0


def sync_atpt(conn: sqlite3.Connection, api_key: str, atpt_code: str, atpt_name: str):
    """한 시도교육청의 전체 학교 동기화"""
    logger.info(f"동기화 시작: {atpt_name} ({atpt_code})")

    page = 1
    total_synced = 0
    page_size = 100

    while True:
        rows, total = fetch_schools(api_key, atpt_code, page, page_size)
        if not rows:
            break

        for idx, row in enumerate(rows):
            school_kind = row.get("SCHUL_KND_SC_NM", "")
            level = SCHOOL_LEVEL_MAP.get(school_kind)
            if not level:
                continue

            addr1 = row.get("ORG_RDNMA") or ""
            addr2 = row.get("ORG_RDNDA") or ""
            address = (addr1 + " " + addr2).strip()
            district = extract_district(address)
            coords = approximate_coords(address, district, idx)

            school_id = f"{atpt_code}-{row['SD_SCHUL_CODE']}"

            region = atpt_name.replace("교육청", "").replace("특별시", "").replace("광역시", "").replace("도", "")

            conn.execute("""
                INSERT OR REPLACE INTO schools
                    (id, name, school_level, address, latitude, longitude,
                     establish_type, coedu_type, district, region, neis_code, atpt_code, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """, (
                school_id,
                row.get("SCHUL_NM", ""),
                level,
                address,
                coords[0] if coords else None,
                coords[1] if coords else None,
                row.get("FOND_SC_NM"),
                row.get("COEDU_SC_NM"),
                district,
                region,
                row.get("SD_SCHUL_CODE"),
                atpt_code,
            ))
            total_synced += 1

        conn.commit()
        logger.info(f"  페이지 {page}: {len(rows)}건 처리 (전체 {total}건)")

        if page * page_size >= total:
            break
        page += 1
        time.sleep(0.3)  # Rate limiting

    # 동기화 로그
    conn.execute("""
        INSERT INTO data_sync_log (source, sync_type, record_count, status)
        VALUES (?, 'api', ?, 'success')
    """, (f"neis_{atpt_code}", total_synced))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS data_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            sync_type TEXT NOT NULL,
            record_count INTEGER,
            status TEXT DEFAULT 'success',
            error_message TEXT,
            synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

    logger.info(f"  → {atpt_name}: {total_synced}건 동기화 완료")
    return total_synced


def main():
    logger.info("=== NEIS 학교정보 동기화 시작 ===")

    env = load_env()
    api_key = env.get("NEIS_API_KEY", "")
    if not api_key:
        logger.error("NEIS_API_KEY가 .env.local에 없습니다")
        sys.exit(1)

    conn = get_db()
    total = 0

    try:
        for atpt_code, atpt_name in ATPT_CODES.items():
            count = sync_atpt(conn, api_key, atpt_code, atpt_name)
            total += count
            time.sleep(1)

        logger.info(f"=== 전체 동기화 완료: {total}건 ===")
    except Exception as e:
        logger.error(f"동기화 중 오류: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
