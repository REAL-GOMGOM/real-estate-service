#!/usr/bin/env python3
"""
학교 주소 → 좌표 변환 (카카오 로컬 API Geocoding)
대상: latitude가 NULL인 학교만 처리
"""

import os
import sys
import json
import sqlite3
import time
import logging
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Optional, Tuple

PROJECT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_DIR / "data" / "realestate.db"
ENV_PATH = PROJECT_DIR / ".env.local"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("geocode")

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"


def load_env():
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                env[key.strip()] = val.strip()
    return env


def geocode(address: str, api_key: str) -> Optional[Tuple[float, float]]:
    """주소 → (위도, 경도)"""
    query = urllib.parse.quote(address)
    url = f"{GEOCODE_URL}?query={query}"

    req = urllib.request.Request(url, headers={
        "Authorization": f"KakaoAK {api_key}",
        "User-Agent": "Mozilla/5.0",
    })

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        docs = data.get("documents", [])
        if docs:
            return (float(docs[0]["y"]), float(docs[0]["x"]))
    except Exception as e:
        logger.warning(f"Geocoding 실패 [{address[:30]}]: {e}")

    return None


def main():
    env = load_env()
    api_key = env.get("KAKAO_REST_API_KEY", "")
    if not api_key:
        logger.error("KAKAO_REST_API_KEY 없음")
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))

    # 좌표 없는 학교 조회
    rows = conn.execute(
        "SELECT id, address FROM schools WHERE latitude IS NULL AND address IS NOT NULL AND address != ''"
    ).fetchall()

    logger.info(f"좌표 변환 대상: {len(rows)}건")

    success = 0
    fail = 0

    for i, (school_id, address) in enumerate(rows):
        # 진행률 로그
        if (i + 1) % 100 == 0:
            logger.info(f"  진행: {i + 1}/{len(rows)} (성공: {success}, 실패: {fail})")

        coords = geocode(address, api_key)
        if coords:
            conn.execute(
                "UPDATE schools SET latitude = ?, longitude = ? WHERE id = ?",
                (coords[0], coords[1], school_id)
            )
            success += 1
        else:
            # 주소 단순화 후 재시도 (도로명 → 시구 단위)
            parts = address.split()
            if len(parts) >= 2:
                simple = " ".join(parts[:2])
                coords = geocode(simple, api_key)
                if coords:
                    conn.execute(
                        "UPDATE schools SET latitude = ?, longitude = ? WHERE id = ?",
                        (coords[0], coords[1], school_id)
                    )
                    success += 1
                else:
                    fail += 1
            else:
                fail += 1

        # 100건마다 커밋
        if (i + 1) % 100 == 0:
            conn.commit()

        # Rate limiting: 초당 약 8건
        time.sleep(0.12)

    conn.commit()
    conn.close()

    logger.info(f"=== 완료: 성공 {success}건, 실패 {fail}건 ===")


if __name__ == "__main__":
    main()
